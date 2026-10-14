# 2048 桌面与 Android 打包

源网页仍是项目根目录的 `index.html`、`style.css`、`script.js`。
`windows/Program.cs` 将网页嵌入 WebView2 单文件 EXE；`windows/Setup.cs` 创建当前用户安装器。
`android/` 为使用系统 WebView 的原生 Android 壳，内置资源通过本地 HTTPS 域名拦截加载，不请求联网权限。

重新构建：在项目目录用 PowerShell 执行 `./packaging/build.ps1`。
需要 Windows .NET Framework C# 编译器、PATH 中的 JDK，以及 `tools/` 中已下载的官方组件。
脚本将当前网页重新嵌入所有安装包，输出到 `dist/`。

下载来源：
- https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4258.31/microsoft.web.webview2.1.0.4258.31.nupkg
- https://dl.google.com/android/repository/build-tools_r35_windows.zip
- https://dl.google.com/android/repository/platform-35_r02.zip

Google repository2-1.xml 中公布的 SHA1：
- build-tools_r35_windows.zip: af059bb67cf7786f45ee0db85e2d24985df1b4b6
- platform-35_r02.zip: 0bb560a90a7a2cbd0dd8348224d518b638fe7949

保留 `signing/2048-release.jks` 与 `signing/password.txt`，后续 APK 更新需用同一密钥签名；不要公开或随安装包发送这两个文件。
更新 Android 应用前还应递增 AndroidManifest.xml 的 versionCode/versionName。

Windows 程序：`dist/2048.exe --smoke-test` 在隐藏窗口中检查真实 WebView2，并在 `dist/test-data/` 写入结果与截图。
Windows 安装器：`dist/2048-Setup.exe --smoke-test` 仅向 `dist/setup-test/` 写入程序和测试快捷方式。
Android 签名：构建脚本自动运行官方 apksigner verify；未进行 Android 实机测试。

回归检查（无需安装依赖）：
- `node packaging/score.test.cjs` 检查跨局计分及动画中重开。
- `node packaging/revive.test.cjs` 检查五个口令独立额度、持久化及失败提交。

复活额度使用本地存储键 `2048-revive-usage`，每个口令最多成功使用五次。
重开不清除额度；清除浏览器/应用数据会清除记录，设备之间不共享次数。
