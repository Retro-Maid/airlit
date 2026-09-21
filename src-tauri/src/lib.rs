use tauri::{
    Emitter,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

const MAIN: &str = "main";
const MINI: &str = "mini";

const MINI_WIDTH: f64 = 316.0;
const MINI_HEIGHT: f64 = 392.0;
/** Gap from the working area's bottom-right corner. */
const MINI_MARGIN: f64 = 18.0;

/// Brings the main window back to the foreground (tray click, second launch, mini controller).
fn reveal(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    set_mini_visible(app, false);
}

/// The mini controller is only useful while the main window is out of the way.
fn set_mini_visible(app: &tauri::AppHandle, visible: bool) {
    let Some(mini) = app.get_webview_window(MINI) else { return };
    if visible {
        let _ = mini.show();
        let _ = mini.set_always_on_top(true);
    } else {
        let _ = mini.hide();
    }
    // Only one window may poll: whichever is on screen. Announce the switch so the other
    // one suspends instead of spending the same 30-requests-per-5-minutes budget twice.
    let _ = app.emit("mini-visible", visible);
}

/// Parks the mini window at the bottom-right of the work area, above the taskbar.
fn place_mini(app: &tauri::AppHandle, mini: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = app.primary_monitor() else { return };
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let origin = monitor.position().to_logical::<f64>(scale);
    let _ = mini.set_position(tauri::LogicalPosition::new(
        origin.x + size.width - MINI_WIDTH - MINI_MARGIN,
        origin.y + size.height - MINI_HEIGHT - MINI_MARGIN - 48.0,
    ));
}

#[tauri::command]
fn show_mini(app: tauri::AppHandle, visible: bool) {
    set_mini_visible(&app, visible);
}

#[tauri::command]
fn open_main(app: tauri::AppHandle) {
    reveal(&app);
}

/// Closing the main window must end the process. The tray icon and the hidden mini window
/// would otherwise keep the app alive with nothing on screen.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "ウィンドウを開く", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main-tray")
        .tooltip("AirLit")
        .menu(&menu)
        // Left click reveals the window; the menu belongs to the right button.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => reveal(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                reveal(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Creates the always-on-top mini controller, hidden until the main window steps aside.
fn build_mini(app: &tauri::AppHandle) -> tauri::Result<()> {
    let mini = WebviewWindowBuilder::new(app, MINI, WebviewUrl::App("index.html?mini=1".into()))
        .title("AirLit ミニコントローラー")
        .inner_size(MINI_WIDTH, MINI_HEIGHT)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()?;
    place_mini(app, &mini);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Must be registered before anything else so a second launch is handed to the first.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            reveal(app);
        }));
    }

    builder
        // The window is a fixed size, so only its position is worth restoring — letting the
        // plugin restore a stale size would resize it despite `resizable: false`.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION)
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![show_mini, open_main, quit_app])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            #[cfg(desktop)]
            {
                // Checking for a new release and relaunching are desktop-only concerns.
                // The updater needs a signing public key in tauri.conf.json; until one is set
                // it must not take the whole app down, so the failure is logged and 更新を確認
                // reports it instead.
                if let Err(error) = app.handle().plugin(tauri_plugin_updater::Builder::new().build()) {
                    log::warn!("updater unavailable: {error}");
                    eprintln!("[AirLit] updater unavailable: {error}");
                }
                app.handle().plugin(tauri_plugin_process::init())?;

                use tauri_plugin_autostart::MacosLauncher;
                app.handle().plugin(tauri_plugin_autostart::init(
                    MacosLauncher::LaunchAgent,
                    None,
                ))?;
                build_tray(app.handle())?;
                build_mini(app.handle())?;

                // Minimising from the OS (taskbar, Win+D) never reaches the frontend, so the
                // mini controller is driven from the window's own events.
                if let Some(main) = app.get_webview_window(MAIN) {
                    let handle = app.handle().clone();
                    main.on_window_event(move |event| match event {
                        WindowEvent::Resized(_) => {
                            let minimized = handle
                                .get_webview_window(MAIN)
                                .and_then(|w| w.is_minimized().ok())
                                .unwrap_or(false);
                            set_mini_visible(&handle, minimized);
                        }
                        WindowEvent::Focused(true) => set_mini_visible(&handle, false),
                        // Alt+F4 and anything else that asks the main window to close
                        // should quit rather than leave a headless process behind.
                        WindowEvent::CloseRequested { .. } => handle.exit(0),
                        _ => {}
                    });
                }
            }

            // Dev builds open the inspector so frontend errors are visible while testing.
            #[cfg(debug_assertions)]
            if let Some(window) = app.get_webview_window(MAIN) {
                window.open_devtools();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
