using System;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

static class Setup
{
    [STAThread]
    static void Main(string[] args)
    {
        if (Array.IndexOf(args, "--smoke-test") >= 0)
        {
            try
            {
                string testDirectory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "setup-test");
                Install(testDirectory, Path.Combine(testDirectory, "2048.lnk"));
            }
            catch { Environment.ExitCode = 1; }
            return;
        }
        Application.EnableVisualStyles();
        var form = new Form { Text = "安装 2048", ClientSize = new System.Drawing.Size(420, 180), StartPosition = FormStartPosition.CenterScreen, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false };
        var label = new Label { Text = "2048 数字游戏\n\n安装到当前用户目录，并创建桌面快捷方式。", AutoSize = true, Left = 24, Top = 24 };
        var install = new Button { Text = "安装并启动", Left = 244, Top = 118, Width = 150, Height = 36 };
        form.Controls.Add(label); form.Controls.Add(install);
        install.Click += delegate
        {
            try
            {
                string directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Xu2048", "app");
                string executable = Install(directory, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "2048.lnk"));
                System.Diagnostics.Process.Start(executable);
                form.Close();
            }
            catch (Exception error) { MessageBox.Show("安装失败：" + error.Message, "2048"); }
        };
        Application.Run(form);
    }

    static string Install(string directory, string shortcutPath)
    {
        Directory.CreateDirectory(directory);
        string executable = Path.Combine(directory, "2048.exe");
        using (Stream source = Assembly.GetExecutingAssembly().GetManifestResourceStream("2048.exe"))
        using (FileStream target = File.Create(executable)) source.CopyTo(target);
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(shellType);
        object shortcut = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { shortcutPath });
        Type shortcutType = shortcut.GetType();
        shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { executable });
        shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { directory });
        shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        return executable;
    }
}
