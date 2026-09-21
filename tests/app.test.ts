import { sensorPanels } from '../src/lib/sensors'
import { deviceStatus, type Device } from '../src/types'
import {
  shouldFire, reservationAt, resolveReservation, untilLabel, nextRunAt,
  emptyLibrary, defaultLibrary, loadLibrary, saveLibrary,
  type Automation, type Reservation,
} from '../src/data/library'
import { isNotable, KIND_TONES, type JournalEntry } from '../src/data/journal'
import { dayLabel, formatRelative } from '../src/lib/format'
import { updateErrorMessage } from '../src/desktop/update'

const results: string[] = []
let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) { failures++; results.push(`FAIL  ${label}\n        期待: ${e}\n        実際: ${a}`) }
  else results.push(`PASS  ${label}`)
}

// --- センサーは実際に取得できたものだけ表示する ---------------------------
{
  const all = sensorPanels({ temperature: 25.14, humidity: 54.2, illumination: 184, movedAt: new Date().toISOString() })
  check('Remo 3 相当：4枚', all.map(p => p.label), ['温度', '湿度', '明るさ', '人感'])
  check('温度は小数1桁', all[0].value, '25.1°')
  check('湿度は整数', all[1].value, '54%')
  check('明るさは単位なし（lxではない）', all[2].value, '184')

  // Remo mini reports only temperature.
  const mini = sensorPanels({ temperature: 22 })
  check('Remo mini 相当：温度のみ', mini.map(p => p.label), ['温度'])

  // Remo E reports nothing at all.
  check('Remo E 相当：0枚', sensorPanels({}).length, 0)

  // A humidity reading of 0 is a real value, not a missing one.
  check('0% を欠損扱いしない', sensorPanels({ humidity: 0 }).map(p => p.value), ['0%'])
  check('照度0 を欠損扱いしない', sensorPanels({ illumination: 0 }).map(p => p.value), ['0'])
}

// --- 状態表示は機種の実態に合わせる ---------------------------------------
{
  const base = { id: 'x', name: 'n', room: '', online: true }
  const ac: Device = { ...base, type: 'ac', power: true, temperature: 25 }
  check('エアコン（運転中）', deviceStatus(ac, { mode: 'warm', vol: 'auto', dir: 'auto' }), '暖房 25°C')
  check('エアコン（停止中）', deviceStatus({ ...ac, power: false }), 'オフ')
  check('赤外線機器は状態を断言しない', deviceStatus({ ...base, type: 'ir', power: true }), '赤外線')
  check('スマートメーター', deviceStatus({ ...base, type: 'energy', power: true, power_w: 642 }), '642 W')
  check('計測前のメーター', deviceStatus({ ...base, type: 'energy', power: true }), '計測中')
  check('照明', deviceStatus({ ...base, type: 'light', power: true }), 'オン')
}

// --- オートメーションの発火判定（二重発火・遡及発火がないこと） -------------
{
  const mk = (time: string, repeat: 'daily' | 'weekdays' | 'weekends', enabled = true): Automation =>
    ({ id: 'a', name: 'n', enabled, lastFiredAt: null, trigger: { type: 'time', time, repeat }, actions: [] })
  const at = (h: number, m: number, s = 0) => new Date(2026, 8, 23, h, m, s)   // 水曜
  const sat = (h: number, m: number) => new Date(2026, 8, 26, h, m, 0)         // 土曜
  check('時刻をまたいだら発火', shouldFire(mk('07:00', 'daily'), at(7, 0, 5), at(6, 59, 50).getTime()), true)
  check('同じ分で再発火しない', shouldFire(mk('07:00', 'daily'), at(7, 0, 25), at(7, 0, 5).getTime()), false)
  check('起動時に遡って発火しない', shouldFire(mk('07:00', 'daily'), at(9, 0), at(8, 59, 40).getTime()), false)
  check('平日指定は土曜に発火しない', shouldFire(mk('07:00', 'weekdays'), sat(7, 0), sat(6, 59, 50).getTime()), false)
  check('週末指定は土曜に発火する', shouldFire(mk('07:00', 'weekends'), sat(7, 0), sat(6, 59, 50).getTime()), true)
  check('無効なものは発火しない', shouldFire(mk('07:00', 'daily', false), at(7, 0, 5), at(6, 59, 50).getTime()), false)
}

// --- 通知に出すのは自動実行とエラーだけ -----------------------------------
{
  const entry = (kind: JournalEntry['kind']): JournalEntry =>
    ({ id: '1', at: 0, kind, title: 't', detail: 'd', source: 's' })
  check('通知対象', (['power', 'aircon', 'signal', 'scene', 'automation', 'error'] as const).filter(k => isNotable(entry(k))),
    ['automation', 'error'])
  check('全種別に色が定義されている',
    (['power', 'aircon', 'signal', 'scene', 'automation', 'error'] as const).every(k => !!KIND_TONES[k]), true)
}

// --- 日時の表記 -------------------------------------------------------------
{
  const now = new Date(2026, 8, 23, 12, 0, 0).getTime()
  check('今日', dayLabel(new Date(2026, 8, 23, 1, 0).getTime(), now), '今日')
  check('昨日', dayLabel(new Date(2026, 8, 22, 23, 0).getTime(), now), '昨日')
  check('それ以前は日付', dayLabel(new Date(2026, 8, 20, 9, 0).getTime(), now), '9月20日')
  check('明日', dayLabel(new Date(2026, 8, 24, 7, 0).getTime(), now), '明日')
  check('明後日は日付', dayLabel(new Date(2026, 8, 25, 7, 0).getTime(), now), '9月25日')
  check('たった今', formatRelative(now - 5_000, now), 'たった今')
  check('分', formatRelative(now - 5 * 60_000, now), '5分前')
  check('時間', formatRelative(now - 3 * 3600_000, now), '3時間前')
}

// --- 予約（オートメーションの単発版） -------------------------------------
{
  // 時刻入力から実行時刻へ。今日ぶんが過ぎていれば翌日に回す。
  const base = new Date(2026, 8, 23, 22, 0, 0)          // 9/23 22:00
  check('未来の時刻は今日', reservationAt('23:30', base), new Date(2026, 8, 23, 23, 30).getTime())
  check('過ぎた時刻は翌日', reservationAt('21:30', base), new Date(2026, 8, 24, 21, 30).getTime())
  check('同時刻も翌日', reservationAt('22:00', base), new Date(2026, 8, 24, 22, 0).getTime())
  check('不正な入力', reservationAt('', base), null)

  const mk = (at: number, status: Reservation['status'] = 'pending'): Reservation =>
    ({ id: 'r', name: 'n', at, actions: [], deviceId: 'd', status })
  const now = new Date(2026, 8, 23, 22, 0, 0).getTime()
  const since = now - 20_000

  check('まだ先なら保留', resolveReservation(mk(now + 60_000), now, since), 'pending')
  check('時刻をまたいだら実行', resolveReservation(mk(now - 5_000), now, since), 'done')
  check('起動前に過ぎていたら未実行として記録', resolveReservation(mk(now - 3_600_000), now, since), 'missed')
  check('実行済みは再実行しない', resolveReservation(mk(now - 5_000, 'done'), now, since), 'done')
  check('未実行のまま放置しない', resolveReservation(mk(now - 5_000, 'missed'), now, since), 'missed')

  check('残り時間の表記', [untilLabel(now + 40 * 60_000, now), untilLabel(now + 80 * 60_000, now), untilLabel(now + 3600_000, now)],
    ['あと40分', 'あと1時間20分', 'あと1時間'])
}

// --- 次の実行（曜日条件を踏まえた絶対時刻） --------------------------------
{
  const mk = (time: string, repeat: 'daily' | 'weekdays' | 'weekends', enabled = true): Automation =>
    ({ id: 'a', name: 'n', enabled, lastFiredAt: null, trigger: { type: 'time', time, repeat }, actions: [] })
  const fri = new Date(2026, 8, 25, 12, 0, 0)          // 金曜 12:00
  check('今日これから', nextRunAt(mk('19:00', 'daily'), fri), new Date(2026, 8, 25, 19, 0).getTime())
  check('今日は過ぎたので明日', nextRunAt(mk('07:00', 'daily'), fri), new Date(2026, 8, 26, 7, 0).getTime())
  check('平日指定は土日を飛ばす', nextRunAt(mk('07:00', 'weekdays'), fri), new Date(2026, 8, 28, 7, 0).getTime())
  check('週末指定は土曜', nextRunAt(mk('07:00', 'weekends'), fri), new Date(2026, 8, 26, 7, 0).getTime())
  check('無効なものは予定に出さない', nextRunAt(mk('19:00', 'daily', false), fri), null)
}

// --- 初回はシーンもオートメーションも空 -------------------------------------
{
  check('空のライブラリ', emptyLibrary(), { scenes: [], automations: [], reservations: [] })
  // デモモードだけはサンプルを持つ。
  const demo = defaultLibrary()
  check('デモはサンプルあり', [demo.scenes.length > 0, demo.automations.length > 0, demo.reservations.length], [true, true, 0])

  // 以前のビルドが実アカウントにも書き込んでしまったサンプルは、読み込み時に取り除く。
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  }
  check('保存が無ければ実アカウントは空', loadLibrary('cloud'), { scenes: [], automations: [], reservations: [] })

  const mine = { id: 'scene-mine', name: '自作', description: '', icon: 'home' as const, color: 'blue' as const, actions: [] }
  saveLibrary('cloud', { ...defaultLibrary(), scenes: [...defaultLibrary().scenes, mine] })
  const loaded = loadLibrary('cloud')
  check('サンプルだけ消える', loaded.scenes.map(s => s.id), ['scene-mine'])
  check('サンプルのオートメーションも消える', loaded.automations.length, 0)
  check('reservations が未保存でも配列', Array.isArray(loaded.reservations), true)

  saveLibrary('mock', defaultLibrary())
  check('デモでは消さない', loadLibrary('mock').scenes.length, defaultLibrary().scenes.length)
}

// --- 更新エラーの表示（英語のまま出さない） -------------------------------
{
  const m = (s: string) => updateErrorMessage(new Error(s))
  check('リリース未公開', m('Could not fetch a valid release JSON from the remote'),
    '公開されているリリースが見つかりませんでした。しばらくしてからもう一度お試しください。')
  check('署名の検証失敗', m('signature verification failed'),
    '配布物の署名を確認できませんでした。安全のため更新を中止しました。')
  check('通信断', m('error sending request for url'), 'ネットワークに接続できませんでした。')
  check('タイムアウト', m('operation timed out'),
    '接続がタイムアウトしました。ネットワークの状態を確認してください。')
  // 未知のエラーは握りつぶさず、原文を添えて出す
  check('未知のエラーは原文を残す', m('some unmapped failure'),
    '更新を確認できませんでした（some unmapped failure）。')
  check('情報がない場合', updateErrorMessage(null), '更新を確認できませんでした。')
}

console.log(results.join('\n'))
console.log(`\n${results.length - failures} / ${results.length} 成功` + (failures ? `  — ${failures}件 失敗` : ''))
process.exit(failures ? 1 : 0)
