using System;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Program
{
    public static string DataDirectory;
    public static bool SmokeTest;

    [STAThread]
    static void Main(string[] args)
    {
        SmokeTest = Array.IndexOf(args, "--smoke-test") >= 0;
        DataDirectory = SmokeTest
            ? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "test-data")
            : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Xu2048");
        try
        {
            Directory.CreateDirectory(DataDirectory);
            if (SmokeTest)
                foreach (string file in new[] { "error.txt", "result.json", "progress.txt", "navigation.txt", "preview.png" })
                    if (File.Exists(Path.Combine(DataDirectory, file))) File.Delete(Path.Combine(DataDirectory, file));
            foreach (string name in new[] { "index.html", "style.css", "script.js", "WebView2Loader.dll" })
                Extract(name, Path.Combine(DataDirectory, name));
            AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs eventArgs)
            {
                string name = new AssemblyName(eventArgs.Name).Name + ".dll";
                if (name != "Microsoft.Web.WebView2.Core.dll" && name != "Microsoft.Web.WebView2.WinForms.dll") return null;
                using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
                {
                    byte[] bytes = new byte[stream.Length];
                    int offset = 0, read;
                    while ((read = stream.Read(bytes, offset, bytes.Length - offset)) > 0) offset += read;
                    return Assembly.Load(bytes);
                }
            };
            Run();
        }
        catch (Exception error)
        {
            Environment.ExitCode = 1;
            if (SmokeTest) File.WriteAllText(Path.Combine(DataDirectory, "error.txt"), error.ToString());
            else MessageBox.Show("启动失败：" + error.Message, "2048", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static void Extract(string name, string path)
    {
        using (Stream source = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
        using (FileStream target = File.Create(path)) source.CopyTo(target);
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    static void Run()
    {
        CoreWebView2Environment.SetLoaderDllFolderPath(DataDirectory);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new GameWindow());
    }
}

class GameWindow : Form
{
    readonly WebView2 browser = new WebView2();
    readonly Timer timeout = new Timer();

    public GameWindow()
    {
        Text = "2048";
        ClientSize = new System.Drawing.Size(520, 740);
        MinimumSize = new System.Drawing.Size(360, 540);
        StartPosition = FormStartPosition.CenterScreen;
        using (Stream icon = Assembly.GetExecutingAssembly().GetManifestResourceStream("game.ico"))
            Icon = new System.Drawing.Icon(icon);
        browser.Dock = DockStyle.Fill;
        Controls.Add(browser);
        if (Program.SmokeTest) { Opacity = 0; ShowInTaskbar = false; }
        Shown += async delegate
        {
            try
            {
                var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.DataDirectory, "browser"));
                await browser.EnsureCoreWebView2Async(environment);
                browser.CoreWebView2.SetVirtualHostNameToFolderMapping("game2048.local", Program.DataDirectory, CoreWebView2HostResourceAccessKind.DenyCors);
                browser.CoreWebView2.Settings.AreDevToolsEnabled = Program.SmokeTest;
                browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                browser.CoreWebView2.NewWindowRequested += delegate(object sender, CoreWebView2NewWindowRequestedEventArgs args) { args.Handled = true; };
                browser.CoreWebView2.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs args)
                {
                    Uri uri;
                    if (!Uri.TryCreate(args.Uri, UriKind.Absolute, out uri) || uri.Host != "game2048.local") args.Cancel = true;
                };
                if (Program.SmokeTest) ConfigureSmokeTest();
                browser.Source = new Uri("https://game2048.local/index.html");
            }
            catch (Exception error)
            {
                Environment.ExitCode = 1;
                if (Program.SmokeTest) File.WriteAllText(Path.Combine(Program.DataDirectory, "error.txt"), error.ToString());
                else MessageBox.Show("请确认已安装 Microsoft Edge WebView2 运行时。\n\n" + error.Message, "2048 启动失败");
                Close();
            }
        };
        FormClosed += delegate { timeout.Dispose(); browser.Dispose(); };
    }

    void ConfigureSmokeTest()
    {
        timeout.Interval = 30000;
        timeout.Tick += delegate { Environment.ExitCode = 1; File.WriteAllText(Path.Combine(Program.DataDirectory, "error.txt"), "Smoke test timed out"); Close(); };
        timeout.Start();
        browser.CoreWebView2.WebMessageReceived += async delegate(object sender, CoreWebView2WebMessageReceivedEventArgs args)
        {
            timeout.Stop();
            string result = args.TryGetWebMessageAsString();
            if (result.StartsWith("progress:"))
            {
                File.AppendAllText(Path.Combine(Program.DataDirectory, "progress.txt"), result + "\n");
                timeout.Start();
                return;
            }
            File.WriteAllText(Path.Combine(Program.DataDirectory, "result.json"), result);
            if (!result.Contains("\"ok\":true")) Environment.ExitCode = 1;
            using (FileStream image = File.Create(Path.Combine(Program.DataDirectory, "preview.png")))
                await browser.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, image);
            Close();
        };
        browser.CoreWebView2.NavigationCompleted += async delegate
        {
            File.WriteAllText(Path.Combine(Program.DataDirectory, "navigation.txt"), browser.Source.ToString());
            await browser.CoreWebView2.ExecuteScriptAsync(@"
              (async () => {
                const checks = [];
                const check = (value, name) => { if (!value) throw Error(name); checks.push(name); window.chrome.webview.postMessage('progress:' + name); };
                try {
                  localStorage.removeItem(REVIVE_STORAGE_KEY); reviveUsage = Object.create(null);
                  check(document.querySelectorAll('#board > .cell').length === 16, 'board');
                  board = [[2,2,2,2],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
                  score = 0; render(); await move('left');
                  check(score === 8 && board[0][0] === 4 && board[0][1] === 4, 'animated merge');
                  check(!animating && !document.querySelector('.moving-tile'), 'animation cleanup');
                  board = [[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]];
                  await move('left');
                  check(gameOver && !reviveDialog.open && !reviveButton.hidden, 'game over screen');
                  reviveButton.click(); check(reviveDialog.open, 'revive dialog');
                  reviveInput.value = 'wrong'; document.getElementById('revive-form').requestSubmit();
                  check(gameOver && reviveError.textContent.length > 0, 'wrong code');
                  reviveInput.value = '我叫徐支行'; document.getElementById('revive-form').requestSubmit();
                  check(!gameOver && !reviveDialog.open && board.flat().filter(v => !v).length === 2 && score === 8, 'revive');
                  for (const code of ['我叫徐支行', '徐支行', '支行', '子涵', '徐子涵']) {
                    const used = readReviveUsage()[code];
                    for (let count = used; count < 5; count++) {
                      board = [[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]];
                      gameOver = true; render(); reviveButton.click();
                      reviveInput.value = code; document.getElementById('revive-form').requestSubmit();
                      check(!gameOver && readReviveUsage()[code] === count + 1 && score === 8, 'code use ' + count);
                      restart(); score = 8;
                    }
                    board = [[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]];
                    gameOver = true; render(); reviveButton.click(); reviveInput.value = code;
                    document.getElementById('revive-form').requestSubmit();
                    check(gameOver && reviveDialog.open && readReviveUsage()[code] === 5, 'sixth use blocked');
                    restart(); score = 8;
                  }
                  check(Object.values(JSON.parse(localStorage.getItem(REVIVE_STORAGE_KEY))).reduce((a,b) => a+b, 0) === 25, 'independent persistent revive limits');
                  localStorage.removeItem(REVIVE_STORAGE_KEY); reviveUsage = Object.create(null);
                  localStorage.setItem('2048-packaging-check', 'ok');
                  check(localStorage.getItem('2048-packaging-check') === 'ok', 'storage');
                  localStorage.removeItem('2048-packaging-check');
                  best = 1000; localStorage.setItem(STORAGE_KEY, '1000');
                  restart();
                  check(score === 0 && best === 1000, 'restart resets current score');
                  board = [[2,2,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; render();
                  await move('left');
                  check(score === 4 && best === 1000 && localStorage.getItem(STORAGE_KEY) === '1000', 'best is not a sum');
                  restart();
                  board = [[512,512,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; render();
                  await move('left');
                  check(score === 1024 && best === 1024, 'new single game record');
                  restart();
                  board = [[1024,1024,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; render();
                  const canceledMove = move('left');
                  move('right');
                  restart();
                  await canceledMove;
                  await new Promise(resolve => setTimeout(resolve, 180));
                  check(score === 0 && best === 1024 && localStorage.getItem(STORAGE_KEY) === '1024' && !queuedDirection && !animating, 'restart cancels pending score and input');
                  restart();
                  window.chrome.webview.postMessage(JSON.stringify({ok:true, checks}));
                } catch (error) { window.chrome.webview.postMessage(JSON.stringify({ok:false,error:String(error),checks})); }
              })();
            ");
        };
    }
}
