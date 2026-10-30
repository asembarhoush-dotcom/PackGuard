use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use cursive::event::Key;
use cursive::style::{Effect, Style};
use cursive::theme::Theme;
use cursive::utils::markup::StyledString;
use cursive::view::{Nameable, Resizable};
use cursive::views::{Dialog, EditView, LinearLayout, NamedView, ScrollView, SelectView, TextView};
use cursive::Cursive;

use crate::{run_scan, truncate, Options, Report};

type MenuScroll = ScrollView<NamedView<SelectView<Entry>>>;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Page {
    Main,
    Mode,
    Results,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Entry {
    ModeMenu,
    EditRefs,
    EditBenign,
    EditScanDir,
    EditPackages,
    EditScanner,
    EditThreads,
    EditReports,
    RunScan,
    ResultsMenu,
    Help,
    Quit,
    ModeKnown,
    ModeNew,
    Result(usize),
    ClearResults,
    Placeholder,
    Separator,
}

#[derive(Clone, Copy)]
enum Field {
    Refs,
    Benign,
    ScanDir,
    Packages,
    Scanner,
    Threads,
    Reports,
}

struct App {
    opts: Options,
    reports: Vec<Report>,
    scanning: bool,
    page: Page,
    rendered_page: Option<Page>,
}

pub fn run(opts: Options) -> Result<(), String> {
    let app = Arc::new(Mutex::new(App {
        opts,
        reports: Vec::new(),
        scanning: false,
        page: Page::Main,
        rendered_page: None,
    }));

    let mut siv = cursive::default();
    siv.set_window_title("PackGuard Configuration");
    siv.set_theme(Theme::terminal_default());
    build_ui(&mut siv, Arc::clone(&app));
    install_keys(&mut siv, Arc::clone(&app));

    siv.try_run()
        .map_err(|error| format!("terminal error: {error}"))
}

fn key_style() -> Style {
    Style::from(Effect::Bold)
}

fn label_style() -> Style {
    Style::none()
}

fn legend_text() -> StyledString {
    let mut text = StyledString::new();
    text.append_styled(" [Up/Down] ", key_style());
    text.append_styled("Navigate   ", label_style());
    text.append_styled("[Space/Enter] ", key_style());
    text.append_styled("Toggle/enter   ", label_style());
    text.append_styled("[Esc] ", key_style());
    text.append_styled("Leave menu\n", label_style());
    text.append_styled(" [S] ", key_style());
    text.append_styled("Run scan   ", label_style());
    text.append_styled("[R] ", key_style());
    text.append_styled("View results   ", label_style());
    text.append_styled("[H] ", key_style());
    text.append_styled("Help   ", label_style());
    text.append_styled("[Q] ", key_style());
    text.append_styled("Quit", label_style());
    text
}

fn build_ui(siv: &mut Cursive, app: Arc<Mutex<App>>) {
    let crumb = TextView::new("").no_wrap().with_name("crumb");
    let title = TextView::new(format!(
        " PackGuard v{} Configuration ",
        env!("CARGO_PKG_VERSION")
    ))
    .style(Effect::Bold)
    .center()
    .fixed_height(1);

    let submit_app = Arc::clone(&app);
    let menu = SelectView::<Entry>::new()
        .on_submit(move |s, entry| dispatch_entry(s, &submit_app, *entry))
        .with_name("menu");
    let menu_scroll = ScrollView::new(menu).with_name("menu_scroll");

    let status = TextView::new("").no_wrap().with_name("status");
    let separator = TextView::new("\u{2500}".repeat(200))
        .no_wrap()
        .fixed_height(1);
    let legend = TextView::new(legend_text()).no_wrap().fixed_height(2);

    let layout = LinearLayout::vertical()
        .child(crumb.fixed_height(1))
        .child(title)
        .child(menu_scroll.full_height())
        .child(separator)
        .child(status.fixed_height(1))
        .child(legend);

    siv.add_fullscreen_layer(layout.full_screen());
    render_page(siv, &app);
    let _ = siv.focus_name("menu");
    set_status(siv, "ready");
}

fn install_keys(siv: &mut Cursive, app: Arc<Mutex<App>>) {
    let esc_app = Arc::clone(&app);
    siv.add_global_callback(Key::Esc, move |s| {
        if modal_open(s) {
            close_modal(s);
            return;
        }
        let page = esc_app.lock().unwrap().page;
        if page == Page::Main {
            s.quit();
        } else {
            esc_app.lock().unwrap().page = Page::Main;
            render_page(s, &esc_app);
        }
    });

    let space_app = Arc::clone(&app);
    siv.add_global_callback(' ', move |s| {
        if modal_open(s) {
            return;
        }
        let selected = s
            .call_on_name("menu", |view: &mut SelectView<Entry>| {
                view.selection().map(|entry| *entry)
            })
            .flatten();
        if let Some(entry) = selected {
            dispatch_entry(s, &space_app, entry);
        }
    });

    let scan_app = Arc::clone(&app);
    siv.add_global_callback('s', move |s| hotkey_scan(s, &scan_app));
    let scan_app = Arc::clone(&app);
    siv.add_global_callback('S', move |s| hotkey_scan(s, &scan_app));

    let results_app = Arc::clone(&app);
    siv.add_global_callback('r', move |s| hotkey_results(s, &results_app));
    let results_app = Arc::clone(&app);
    siv.add_global_callback('R', move |s| hotkey_results(s, &results_app));

    siv.add_global_callback('h', hotkey_help);
    siv.add_global_callback('H', hotkey_help);

    siv.add_global_callback('q', hotkey_quit);
    siv.add_global_callback('Q', hotkey_quit);
}

fn hotkey_scan(s: &mut Cursive, app: &Arc<Mutex<App>>) {
    if !modal_open(s) {
        start_scan(s, app);
    }
}

fn hotkey_results(s: &mut Cursive, app: &Arc<Mutex<App>>) {
    if modal_open(s) {
        return;
    }
    go_page(s, app, Page::Results);
    set_results_status(s, app);
}

fn hotkey_help(s: &mut Cursive) {
    if !modal_open(s) {
        show_help(s);
    }
}

fn hotkey_quit(s: &mut Cursive) {
    if !modal_open(s) {
        s.quit();
    }
}

fn modal_open(s: &Cursive) -> bool {
    s.screen().len() > 1
}

fn close_modal(s: &mut Cursive) {
    if modal_open(s) {
        s.pop_layer();
        let _ = s.focus_name("menu");
    }
}

fn go_page(s: &mut Cursive, app: &Arc<Mutex<App>>, page: Page) {
    app.lock().unwrap().page = page;
    render_page(s, app);
}

fn render_page(s: &mut Cursive, app: &Arc<Mutex<App>>) {
    let (page, opts, reports, preserve) = {
        let state = app.lock().unwrap();
        (
            state.page,
            state.opts.clone(),
            state.reports.clone(),
            state.rendered_page == Some(state.page),
        )
    };

    let (crumb, items) = match page {
        Page::Main => (" (Top)", main_items(&opts)),
        Page::Mode => (" (Mode)", mode_items(&opts)),
        Page::Results => (" (Scan Results)", result_items(&reports)),
    };

    let _ = s.call_on_name("crumb", |view: &mut TextView| view.set_content(crumb));

    let _ = s.call_on_name("menu", |view: &mut SelectView<Entry>| {
        let selected = if preserve {
            view.selected_id()
        } else {
            Some(0)
        };
        view.clear();
        for (label, entry) in &items {
            view.add_item(format!(" {label}"), *entry);
        }
        if !items.is_empty() {
            let index = selected.unwrap_or(0).min(items.len() - 1);
            let _ = view.set_selection(index);
        }
    });

    let _ = s.call_on_name("menu_scroll", |view: &mut MenuScroll| {
        view.scroll_to_important_area();
    });

    app.lock().unwrap().rendered_page = Some(page);
}

fn main_items(opts: &Options) -> Vec<(String, Entry)> {
    let mode = if opts.mode == "known" {
        "known - v6"
    } else {
        "new - primitives"
    };
    let mode = format!("({mode}) Mode  --->");
    let refs = format!("({}) Malware reference directory", option_text(&opts.refs));
    let benign = format!("({}) Benign reference directory", option_text(&opts.benign));
    let scan_dir = format!("({}) Scan directory", option_text(&opts.scan_dir));
    let packages = if opts.packages.is_empty() {
        "(none) Extra packages".to_string()
    } else {
        format!("({}) Extra packages", opts.packages.len())
    };
    let scanner = format!(
        "({}) Scanner binary",
        truncate(&clean(&opts.packguard.display().to_string()), 48)
    );
    let threads = format!("({}) Worker threads", opts.threads);
    let reports = format!("({}) Report directory", option_text(&opts.reports));

    vec![
        (mode, Entry::ModeMenu),
        (refs, Entry::EditRefs),
        (benign, Entry::EditBenign),
        (scan_dir, Entry::EditScanDir),
        (packages, Entry::EditPackages),
        (scanner, Entry::EditScanner),
        (threads, Entry::EditThreads),
        (reports, Entry::EditReports),
        ("--- Actions ---".to_string(), Entry::Separator),
        ("Run scan".to_string(), Entry::RunScan),
        ("View results  --->".to_string(), Entry::ResultsMenu),
        ("Help".to_string(), Entry::Help),
        ("Quit".to_string(), Entry::Quit),
    ]
}

fn mode_items(opts: &Options) -> Vec<(String, Entry)> {
    let known = if opts.mode == "known" { "[*]" } else { "[ ]" };
    let new = if opts.mode == "new" { "[*]" } else { "[ ]" };
    vec![
        (
            format!("{known} known  - raw + normalised views, benign veto"),
            Entry::ModeKnown,
        ),
        (
            format!("{new} new    - raw NCD + behavioural primitives"),
            Entry::ModeNew,
        ),
    ]
}

fn result_items(reports: &[Report]) -> Vec<(String, Entry)> {
    if reports.is_empty() {
        return vec![(
            "(no scan results yet - run a scan from the main menu)".to_string(),
            Entry::Placeholder,
        )];
    }

    let mut items = Vec::with_capacity(reports.len() + 2);
    for (index, report) in reports.iter().enumerate() {
        let mark = if report.flagged { "[*]" } else { "[ ]" };
        let score = report
            .score
            .map(|value| format!("{value:.4}"))
            .unwrap_or_else(|| "--".to_string());
        let primitive = match (report.primitive_score, report.primitive_flagged) {
            (Some(value), true) => format!("{value}*"),
            (Some(value), false) => value.to_string(),
            (None, _) => "-".to_string(),
        };
        let row = format!(
            "{mark} {:<28} {:<10} {:>6} {:>4} {}",
            truncate(&clean(&report.package), 28),
            truncate(&clean(&report.version), 10),
            score,
            primitive,
            truncate(&clean(&report.primitive_hits), 20)
        );
        items.push((row, Entry::Result(index)));
    }
    items.push(("--- Actions ---".to_string(), Entry::Separator));
    items.push(("Clear results".to_string(), Entry::ClearResults));
    items
}

fn dispatch_entry(s: &mut Cursive, app: &Arc<Mutex<App>>, entry: Entry) {
    match entry {
        Entry::Separator | Entry::Placeholder => {}
        Entry::ModeMenu => go_page(s, app, Page::Mode),
        Entry::ResultsMenu => {
            go_page(s, app, Page::Results);
            set_results_status(s, app);
        }
        Entry::RunScan => start_scan(s, app),
        Entry::Help => show_help(s),
        Entry::Quit => s.quit(),
        Entry::EditRefs => edit_value(s, app, Field::Refs),
        Entry::EditBenign => edit_value(s, app, Field::Benign),
        Entry::EditScanDir => edit_value(s, app, Field::ScanDir),
        Entry::EditPackages => edit_value(s, app, Field::Packages),
        Entry::EditScanner => edit_value(s, app, Field::Scanner),
        Entry::EditThreads => edit_value(s, app, Field::Threads),
        Entry::EditReports => edit_value(s, app, Field::Reports),
        Entry::ModeKnown => {
            app.lock().unwrap().opts.mode = "known".to_string();
            go_page(s, app, Page::Main);
            set_status(s, "mode set to known (v6)");
        }
        Entry::ModeNew => {
            app.lock().unwrap().opts.mode = "new".to_string();
            go_page(s, app, Page::Main);
            set_status(s, "mode set to new");
        }
        Entry::Result(index) => show_result(s, app, index),
        Entry::ClearResults => clear_results(s, app),
    }
}

fn edit_value(s: &mut Cursive, app: &Arc<Mutex<App>>, field: Field) {
    let opts = app.lock().unwrap().opts.clone();
    let hint = TextView::new(field.hint());
    let input_app = Arc::clone(app);
    let input = EditView::new()
        .content(field.current(&opts))
        .on_submit(move |s, _| apply_edit(s, &input_app, field))
        .with_name("value")
        .fixed_width(64);
    let error = TextView::new("")
        .style(Effect::Bold)
        .with_name("edit_error");

    let form = LinearLayout::vertical()
        .child(hint)
        .child(input)
        .child(error);

    let save_app = Arc::clone(app);
    let dialog = Dialog::around(form)
        .title(format!(" {} ", field.title()))
        .padding_lrtb(1, 1, 1, 1)
        .button("OK", move |s| apply_edit(s, &save_app, field))
        .button("Cancel", close_modal);

    s.add_layer(dialog);
}

fn apply_edit(s: &mut Cursive, app: &Arc<Mutex<App>>, field: Field) {
    let value = s
        .call_on_name("value", |view: &mut EditView| {
            view.get_content().to_string()
        })
        .unwrap_or_default();

    let outcome = {
        let mut state = app.lock().unwrap();
        field.apply(&mut state.opts, &value)
    };

    match outcome {
        Ok(()) => {
            close_modal(s);
            render_page(s, app);
            set_status(s, &format!("{} updated", field.name()));
        }
        Err(message) => {
            let _ = s.call_on_name("edit_error", |view: &mut TextView| {
                view.set_content(format!("ERROR: {message}"))
            });
        }
    }
}

impl Field {
    fn title(self) -> &'static str {
        match self {
            Field::Refs => "Malware reference directory",
            Field::Benign => "Benign reference directory",
            Field::ScanDir => "Scan directory",
            Field::Packages => "Extra packages",
            Field::Scanner => "Scanner binary",
            Field::Threads => "Worker threads",
            Field::Reports => "Report directory",
        }
    }

    fn name(self) -> &'static str {
        match self {
            Field::Refs => "malware reference directory",
            Field::Benign => "benign reference directory",
            Field::ScanDir => "scan directory",
            Field::Packages => "extra packages",
            Field::Scanner => "scanner binary",
            Field::Threads => "worker threads",
            Field::Reports => "report directory",
        }
    }

    fn hint(self) -> &'static str {
        match self {
            Field::Refs => "Directory of malware reference chunks. Required for a scan.",
            Field::Benign => "Benign reference directory. Known mode uses it for the benign veto.",
            Field::ScanDir => {
                "Scan every package directly inside this directory. Optional with extra packages."
            }
            Field::Packages => "Extra package directories, separated by ';'. Optional.",
            Field::Scanner => "Path to the C scanner, or a command name found on PATH.",
            Field::Threads => "Worker threads, 1 or more.",
            Field::Reports => {
                "Keep the JSON reports here instead of a temporary directory. Optional."
            }
        }
    }

    fn current(self, opts: &Options) -> String {
        match self {
            Field::Refs => display_empty(&opts.refs),
            Field::Benign => display_empty(&opts.benign),
            Field::ScanDir => display_empty(&opts.scan_dir),
            Field::Packages => opts
                .packages
                .iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>()
                .join(";"),
            Field::Scanner => opts.packguard.display().to_string(),
            Field::Threads => opts.threads.to_string(),
            Field::Reports => display_empty(&opts.reports),
        }
    }

    fn apply(self, opts: &mut Options, value: &str) -> Result<(), String> {
        match self {
            Field::Refs => {
                opts.refs = path_option(value);
            }
            Field::Benign => {
                opts.benign = path_option(value);
            }
            Field::ScanDir => {
                opts.scan_dir = path_option(value);
            }
            Field::Packages => {
                opts.packages = value
                    .split(';')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(PathBuf::from)
                    .collect();
            }
            Field::Scanner => {
                let value = value.trim();
                if value.is_empty() {
                    return Err("scanner path cannot be empty".to_string());
                }
                opts.packguard = PathBuf::from(value);
            }
            Field::Threads => {
                let threads = value
                    .trim()
                    .parse::<usize>()
                    .map_err(|_| "threads must be a number of 1 or more".to_string())?;
                if threads == 0 {
                    return Err("threads must be a number of 1 or more".to_string());
                }
                opts.threads = threads;
            }
            Field::Reports => {
                opts.reports = path_option(value);
            }
        }
        Ok(())
    }
}

fn path_option(value: &str) -> Option<PathBuf> {
    let value = value.trim();
    if value.is_empty() {
        None
    } else {
        Some(PathBuf::from(value))
    }
}

fn display_empty(value: &Option<PathBuf>) -> String {
    value
        .as_ref()
        .map(|path| path.display().to_string())
        .unwrap_or_default()
}

fn option_text(value: &Option<PathBuf>) -> String {
    value
        .as_ref()
        .map(|path| truncate(&clean(&path.display().to_string()), 48))
        .unwrap_or_else(|| "none".to_string())
}

fn set_status(s: &mut Cursive, message: &str) {
    let mut text = StyledString::styled(" Status: ", key_style());
    text.append_plain(clean(message));
    let _ = s.call_on_name("status", |view: &mut TextView| view.set_content(text));
}

fn set_results_status(s: &mut Cursive, app: &Arc<Mutex<App>>) {
    let (count, flagged) = {
        let state = app.lock().unwrap();
        let flagged = state.reports.iter().filter(|report| report.flagged).count();
        (state.reports.len(), flagged)
    };
    set_status(s, &format!("{count} package(s), {flagged} flagged"));
}

fn start_scan(s: &mut Cursive, app: &Arc<Mutex<App>>) {
    let problem = {
        let mut state = app.lock().unwrap();
        if state.scanning {
            Some("scan already running")
        } else if state.opts.refs.is_none() {
            Some("set a malware reference directory first")
        } else if state.opts.scan_dir.is_none() && state.opts.packages.is_empty() {
            Some("set a scan directory or extra packages first")
        } else {
            state.scanning = true;
            None
        }
    };
    if let Some(problem) = problem {
        set_status(s, problem);
        return;
    }

    let opts = app.lock().unwrap().opts.clone();
    let sink = s.cb_sink().clone();
    let sink_done = sink.clone();
    let app_done = Arc::clone(app);
    let ticker_app = Arc::clone(app);
    let ticker_stop = Arc::new(AtomicBool::new(false));
    let ticker_flag = Arc::clone(&ticker_stop);
    let ticker_sink = sink.clone();
    let mode = opts.mode.clone();

    set_status(s, "scanning ...");

    let _ = thread::spawn(move || {
        let started = Instant::now();
        while !ticker_flag.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_secs(1));
            if ticker_flag.load(Ordering::Relaxed) {
                break;
            }
            let message = format!("scanning ({mode}) {}s", started.elapsed().as_secs());
            let app_check = Arc::clone(&ticker_app);
            let sent = ticker_sink.send(Box::new(move |s| {
                if app_check.lock().unwrap().scanning {
                    set_status(s, &message);
                }
            }));
            if sent.is_err() {
                break;
            }
        }
    });

    let _ = thread::spawn(move || {
        let mut progress = |line: &str| {
            let message = line.to_string();
            let sink = sink.clone();
            let _ = sink.send(Box::new(move |s| set_status(s, &message)));
        };
        let result = run_scan(&opts, &mut progress);
        ticker_stop.store(true, Ordering::Relaxed);
        let _ = sink_done.send(Box::new(move |s| finish_scan(s, &app_done, result)));
    });
}

fn finish_scan(s: &mut Cursive, app: &Arc<Mutex<App>>, result: Result<Vec<Report>, String>) {
    match result {
        Ok(reports) => {
            let (count, flagged) = {
                let mut state = app.lock().unwrap();
                state.scanning = false;
                state.reports = reports;
                let flagged = state.reports.iter().filter(|report| report.flagged).count();
                (state.reports.len(), flagged)
            };
            render_page(s, app);
            set_status(s, &format!("done - {count} package(s), {flagged} flagged"));
        }
        Err(error) => {
            app.lock().unwrap().scanning = false;
            set_status(s, "scan failed");
            show_message(s, "Scan failed", &error);
        }
    }
}

fn clear_results(s: &mut Cursive, app: &Arc<Mutex<App>>) {
    app.lock().unwrap().reports.clear();
    render_page(s, app);
    set_status(s, "results cleared");
}

fn show_result(s: &mut Cursive, app: &Arc<Mutex<App>>, index: usize) {
    let report = app.lock().unwrap().reports.get(index).cloned();
    let report = match report {
        Some(report) => report,
        None => {
            set_status(s, "no such result");
            return;
        }
    };

    let score = report
        .score
        .map(|value| format!("{value:.4}"))
        .unwrap_or_else(|| "--".to_string());
    let threshold = report
        .threshold
        .map(|value| format!("{value:.4}"))
        .unwrap_or_else(|| "--".to_string());
    let primitive = report
        .primitive_score
        .map(|value| value.to_string())
        .unwrap_or_else(|| "-".to_string());
    let package = clean(&report.package);
    let version = clean(&report.version);
    let hits = clean(&report.primitive_hits);

    let body = format!(
        "PACKAGE    {}\n\
         VERSION    {}\n\
         SCORE      {}\n\
         THRESHOLD  {}\n\
         FLAGGED    {}\n\
         PRIMITIVE  {}\n\
         PRIM. FLAG {}\n\
         HITS       {}",
        package,
        if version.is_empty() {
            "-"
        } else {
            version.as_str()
        },
        score,
        threshold,
        if report.flagged { "YES" } else { "no" },
        primitive,
        if report.primitive_flagged {
            "YES"
        } else {
            "no"
        },
        if hits.is_empty() { "-" } else { hits.as_str() }
    );

    let dialog = Dialog::around(TextView::new(body))
        .title(" Package detail ")
        .button("OK", close_modal);
    s.add_layer(dialog);
}

fn show_help(s: &mut Cursive) {
    let text = "PackGuard stage 1 configuration\n\n\
                Up/Down       move through the menu\n\
                Space/Enter   open a submenu, edit a value or run an action\n\
                Esc           leave the current menu; quits from the main menu\n\
                S             run a scan\n\
                R             view scan results\n\
                H             this help\n\
                Q             quit\n\n\
                Entries shown as (value) open an edit box.\n\
                Entries with ---> open a submenu.\n\
                [*] marks the active mode or a flagged package.\n\n\
                The scanner is run as packguard from PATH unless a\n\
                different binary is set in the main menu.";
    let dialog = Dialog::around(TextView::new(text))
        .title(" Help ")
        .button("OK", close_modal);
    s.add_layer(dialog);
}

fn show_message(s: &mut Cursive, title: &str, text: &str) {
    let body = ScrollView::new(TextView::new(text.to_string()))
        .fixed_width(72)
        .fixed_height(14);
    let dialog = Dialog::around(body)
        .title(format!(" {title} "))
        .button("OK", close_modal);
    s.add_layer(dialog);
}

fn clean(text: &str) -> String {
    text.chars()
        .map(|ch| if ch.is_control() { ' ' } else { ch })
        .collect()
}
