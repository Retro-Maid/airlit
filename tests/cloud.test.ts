import { CloudAdapter } from '../src/data/adapter'
import { RemoClient } from '../src/api/client'
import { RateLimiter } from '../src/api/rateLimiter'
import { RemoApiError } from '../src/api/types'

// Payloads shaped like real api.nature.global responses.
const APPLIANCES = [
  {
    id: 'ac-1',
    device: { id: 'dev-1', name: 'リビングのRemo' },
    model: { id: 'm1', manufacturer: 'daikin', name: 'Daikin AC 001', image: 'ico_ac_1' },
    type: 'AC',
    nickname: 'リビングのエアコン',
    image: 'ico_ac_1',
    settings: { temp: '26', temp_unit: 'c', mode: 'cool', vol: 'auto', dir: 'auto', dirh: 'auto', button: '', updated_at: '2026-09-20T12:00:00Z' },
    aircon: {
      range: {
        modes: {
          cool: { temp: ['21', '22', '23', '24', '25', '26'], vol: ['auto', '1', '2', '3'], dir: ['auto', '1', '2'], dirh: ['auto'] },
          warm: { temp: ['18', '19', '20'], vol: ['auto', '1'], dir: ['auto'], dirh: ['auto'] },
          dry: { temp: ['24'], vol: ['auto'], dir: ['auto'], dirh: ['auto'] },
        },
        fixedButtons: ['power-off'],
      },
      tempUnit: 'c',
    },
    signals: [],
  },
  {
    id: 'ac-off',
    device: { id: 'dev-1', name: '寝室のRemo' },
    model: null,
    type: 'AC',
    nickname: '寝室のエアコン',
    image: 'ico_ac_1',
    settings: { temp: '22', temp_unit: 'c', mode: 'warm', vol: '1', dir: 'auto', button: 'power-off', updated_at: '' },
    aircon: { range: { modes: { warm: { temp: ['22'], vol: ['auto'], dir: ['auto'] } }, fixedButtons: [] }, tempUnit: 'c' },
    signals: [],
  },
  {
    id: 'light-1',
    device: { id: 'dev-1', name: 'リビングのRemo' },
    model: { id: 'm2', manufacturer: 'nec', name: 'Ceiling Light', image: 'ico_light' },
    type: 'LIGHT',
    nickname: 'リビングの照明',
    image: 'ico_light',
    light: { state: { brightness: '', power: 'off', last_button: 'off' }, buttons: [{ name: 'on', image: 'ico_on', label: 'ON' }] },
    signals: [],
  },
  {
    id: 'tv-1',
    device: { id: 'dev-1', name: 'リビングのRemo' },
    model: { id: 'm3', manufacturer: 'sony', name: 'BRAVIA', image: 'ico_tv' },
    type: 'TV',
    nickname: 'リビングのテレビ',
    image: 'ico_tv',
    tv: { state: { input: 't' }, buttons: [{ name: 'power', image: 'ico_io', label: 'TV_power' }] },
    signals: [],
  },
  {
    id: 'ir-1',
    device: { id: 'dev-1', name: '書斎のRemo' },
    model: null,
    type: 'IR',
    nickname: '',                       // deliberately blank: name must fall back
    image: 'ico_signal',
    signals: [
      { id: 'sig-1', name: '電源', image: 'ico_io' },
      { id: 'sig-2', name: '風量', image: 'ico_wind' },
    ],
  },
  {
    id: 'meter-1',
    device: { id: 'dev-2', name: '分電盤のRemo E' },
    model: { id: 'm4', manufacturer: 'nature', name: 'Remo E lite', image: 'ico_smartmeter' },
    type: 'EL_SMART_METER',
    nickname: 'スマートメーター',
    image: 'ico_smartmeter',
    smart_meter: {
      echonetlite_properties: [
        { name: 'coefficient', epc: 211, val: '1', updated_at: '2026-09-20T12:00:00Z' },
        { name: 'normal_direction_cumulative_electric_energy', epc: 224, val: '123456', updated_at: '2026-09-20T12:00:00Z' },
        { name: 'measured_instantaneous', epc: 231, val: '642', updated_at: '2026-09-20T12:00:00Z' },
      ],
    },
    signals: [],
  },
]

const DEVICES = [
  {
    id: 'dev-1', name: 'リビングのRemo', firmware_version: 'Remo/1.14.4',
    mac_address: 'aa:bb', serial_number: '1W1', temperature_offset: 0, humidity_offset: 0,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-09-20T12:00:00Z',
    newest_events: {
      te: { val: 25.1, created_at: '2026-09-20T12:00:00Z' },
      hu: { val: 54, created_at: '2026-09-20T12:00:00Z' },
      il: { val: 184, created_at: '2026-09-20T12:00:00Z' },
      mo: { val: 1, created_at: '2026-09-20T11:45:00Z' },
    },
  },
]

// ---------------------------------------------------------------------------

const results: string[] = []
let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const ok = a === e
  if (!ok) failures++
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        期待: ${e}\n        実際: ${a}`}`)
}

const calls: { url: string; method: string; body?: string; auth?: string }[] = []

function stubFetch(status = 200, headers: Record<string, string> = {}) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? String(init.body) : undefined,
      auth: (init?.headers as Record<string, string>)?.Authorization,
    })
    const payload = url.endsWith('/appliances') ? APPLIANCES : url.endsWith('/devices') ? DEVICES : {}
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    })
  }) as typeof fetch
}

const fastLimiter = () => new RateLimiter({ minIntervalMs: 0 })

// --- 1. mapping -------------------------------------------------------------
{
  const client = new RemoClient('test-token', { fetchImpl: stubFetch(), limiter: fastLimiter() })
  const home = await new CloudAdapter(client).load()

  check('デバイス数', home.devices.length, 6)
  check('種別の対応', home.devices.map(d => d.type), ['ac', 'ac', 'light', 'tv', 'ir', 'energy'])
  check('名前', home.devices[0].name, 'リビングのエアコン')
  check('部屋名（Remo名）', home.devices[0].room, 'リビングのRemo')
  check('設定温度', home.devices[0].temperature, 26)
  check('エアコン電源（button空＝オン）', home.devices[0].power, true)
  check('エアコン電源（power-off＝オフ）', home.devices[1].power, false)
  check('照明の電源（state.power=off）', home.devices[2].power, false)
  check('nickname空のときの名前フォールバック', home.devices[4].name, '名称未設定')
  check('瞬時電力（EPC 231）', home.devices[5].power_w, 642)

  check('AC設定の取り込み', home.acSettings['ac-1'], { mode: 'cool', vol: 'auto', dir: 'auto' })
  check('機種ごとのモード一覧', home.capabilities['ac-1'].modes, ['cool', 'warm', 'dry'])
  check('機種ごとの風量一覧', home.capabilities['ac-1'].volumes, ['auto', '1', '2', '3'])
  check('学習信号', home.signals['ir-1']?.map(s => s.name), ['電源', '風量'])
  check('センサー値', home.sensors, { temperature: 25.1, humidity: 54, illumination: 184, movedAt: '2026-09-20T11:45:00Z' })
  check('認証ヘッダ', calls[0].auth, 'Bearer test-token')
}

// --- 2. writes --------------------------------------------------------------
{
  calls.length = 0
  const client = new RemoClient('test-token', { fetchImpl: stubFetch(), limiter: fastLimiter() })
  const adapter = new CloudAdapter(client)
  const ac = { id: 'ac-1', name: 'a', room: '', type: 'ac' as const, power: true, online: true, temperature: 26 }
  const light = { id: 'light-1', name: 'l', room: '', type: 'light' as const, power: false, online: true }

  await adapter.setAirCon(ac, { mode: 'warm', vol: '2', dir: 'auto', temperature: 24 })
  check('エアコン更新のURL', calls[0].url.endsWith('/appliances/ac-1/aircon_settings'), true)
  check('エアコン更新のメソッド', calls[0].method, 'POST')
  check('エアコン更新の本文', calls[0].body, 'temperature=24&operation_mode=warm&air_volume=2&air_direction=auto')

  await adapter.setPower(ac, false)
  check('エアコン電源オフの本文', calls[1].body, 'button=power-off')

  await adapter.setPower(light, true)
  check('照明オンのURL', calls[2].url.endsWith('/appliances/light-1/light'), true)
  check('照明オンの本文', calls[2].body, 'button=on')

  await adapter.sendSignal(ac, 'sig-1')
  check('信号送信のURL', calls[3].url.endsWith('/signals/sig-1/send'), true)
}

// --- 3. errors and the budget ----------------------------------------------
{
  const client = new RemoClient('bad', { fetchImpl: stubFetch(401), limiter: fastLimiter() })
  let kind = ''
  try { await client.me() } catch (e) { kind = (e as RemoApiError).kind }
  check('401 の分類', kind, 'auth')
}
{
  const reset = Math.floor(Date.now() / 1000) + 120
  const limiter = fastLimiter()
  const client = new RemoClient('t', {
    fetchImpl: stubFetch(429, { 'X-Rate-Limit-Reset': String(reset) }),
    limiter,
  })
  let kind = ''
  try { await client.appliances() } catch (e) { kind = (e as RemoApiError).kind }
  check('429 の分類', kind, 'rate-limit')
  check('429 で送信を停止', limiter.snapshot().pausedUntil !== null, true)
}
{
  const limiter = fastLimiter()
  const client = new RemoClient('t', {
    fetchImpl: stubFetch(200, { 'X-Rate-Limit-Limit': '30', 'X-Rate-Limit-Remaining': '27' }),
    limiter,
  })
  await client.devices()
  const snap = limiter.snapshot()
  check('残量ヘッダの取り込み', { limit: snap.limit, remaining: snap.remaining }, { limit: 30, remaining: 27 })
}
{
  const client = new RemoClient('t', {
    fetchImpl: (async () => { throw new TypeError('network down') }) as typeof fetch,
    limiter: fastLimiter(),
  })
  let kind = ''
  try { await client.devices() } catch (e) { kind = (e as RemoApiError).kind }
  check('通信断の分類', kind, 'network')
}

console.log(results.join('\n'))
console.log(`\n${results.length - failures} / ${results.length} 成功` + (failures ? `  — ${failures}件 失敗` : ''))
process.exit(failures ? 1 : 0)
