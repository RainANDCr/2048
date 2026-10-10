# 2048 数字游戏

使用原生 HTML、CSS、JavaScript 开发，无需安装网页依赖。

## 游玩

下载项目后双击 `index.html`。电脑使用方向键或 WASD；手机在棋盘上滑动。
相同数字合并，首次达到 2048 后可继续挑战。包含滑动、合并和数字出现动画。

当前分数每局从 0 开始，最高分保存历史最佳单局成绩。
游戏结束后可以重新开始，也可以点击下方的“输入口令复活”。
每个约定口令最多成功使用 5 次，随机清空两个格子并保留分数。
次数保存在当前浏览器或设备本地，重开不会重置；清除应用/浏览器数据会清除记录。

## 安装包（1.0.2）

- [Windows 安装版](dist/2048-Setup.exe)
- [Windows 免安装版](dist/2048.exe)
- [Android APK](dist/2048.apk)
- [完整安装包压缩文件](dist/2048-installers.zip)
- [使用说明](dist/使用说明.txt)

Windows 支持 64 位 Windows 10/11，需要 WebView2 运行时和 .NET Framework 4.6.2 或更高版本。
Android 支持 8.0 或更高版本，需要保持系统 WebView 更新。均支持离线游玩。
EXE 未进行商业代码签名。APK 已验证签名，尚未进行 Android 实机测试。

## GitHub Pages 发布

上传到公开 GitHub 仓库后，在 **Settings → Pages** 中设置：

1. Source：**Deploy from a branch**。
2. Branch：**main**，目录 **/(root)**。
3. 点击 **Save**，等候 GitHub 部署完成，在 Pages 页面打开发布的链接。

根目录包含 `.nojekyll`，网页直接使用 `index.html`、`style.css`、`script.js`。
将来修改这三个文件并推送到 main 后，Pages 会重新发布。

## 文件与开发

- `index.html`：页面结构。
- `style.css`：样式与动画。
- `script.js`：棋局、计分、输入、复活与本地保存。
- `packaging/`：Windows 和 Android 壳程序、构建脚本、回归测试。
- `dist/`：安装包和第三方组件许可说明。

逻辑检查（需要 Node.js，无需安装 npm 依赖）：

```sh
node packaging/score.test.cjs
node packaging/revive.test.cjs
```

桌面与 Android 重新构建步骤见 [打包说明](packaging/README.md)。
签名密钥、密码、下载的 SDK 和测试输出均通过 `.gitignore` 排除，不能上传。
