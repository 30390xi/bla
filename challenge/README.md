# 🛡️ BLA CrackMe 公开挑战赛 v3.0 — Bankrupt Sovereign Edition

欢迎来到 **BLA (`bla-agents`) 公开逆向挑战靶场 (v3.0 Bankrupt Sovereign Edition)**！

本目录下的 [`bla-crackme.cjs`](./bla-crackme.cjs) 是使用 `bla-agents` 全套武器库（`node dist/cli.js defend --intensity bankrupt` + 内嵌 BLA 加固版 WebAssembly 协处理器 + Split-Share 滚动异或内存分片）生成的独立 Node.js 靶机程序（零外部依赖，直接用 `node` 即可运行）。

欢迎各位佬友挂载 **REA**、**Claude Code (Opus)**、**Codex**、**Cursor**、**GLM-5.3**，或者亲自上阵手撕，看看能不能在算力预算耗尽前拿到真正的 `FLAG{...}`！

---

## 🔥 v3.0 升级说明（致敬第一版红队破阵佬友）

感谢社区佬友对初版靶机的精彩 Writeup！针对初版被指出的四处结构性弱点，**v3.0 Bankrupt Sovereign Edition** 已配合 `bla-agents v1.4.4` 核心引擎完成了彻底重构：

1. **零可反演结构量（纯 32 字节全宽 SHA-256 `timingSafeEqual` 比对）**：
   彻底移除了初版的模 $2^{16}$ 线性同余递推方程（`pairs[i]`）与 8 字节短 Tag。v3.0 校验器仅对输入密钥经内嵌 **BLA 加固版 WebAssembly 8 通道 ARX 协处理器**混淆后执行 **32 轮全宽 32 字节 SHA-256 承诺比对（`crypto.timingSafeEqual`）**；且每个密钥的末尾字节从不以任何形式落盘，仅提交在全宽 SHA-256 摘要中，代数反演（Z3 / 模逆递推）完全失效。
2. **16 个 Slot 100% 全部可达且验证成本完全恒等**：
   废除初版“4 死 1 活”的静态路标。v3.0 内置 **16 个运行时 100% 可达、验证开销完全相同的平行密码槽（Slot 0..15）**，守卫谓词全部由运行时高精度时钟熵动态驱动，不存在任何静态恒假死分支。
3. **密钥与 Flag 零自报家门（16 个全长得像真 Flag）**：
   16 个可达 Slot 对应的 16 把高熵密钥均能成功通过各自的 32 字节全宽 SHA-256 校验，并解密出 **16 个格式、长度（50 字节）、语义完全逼真的 `FLAG{...}`**，绝不自报“诱饵”身份。只有比对下方唯一目标 SHA-256 指纹才能锁定真身。
4. **`process.hrtime.bigint()` 动态熵源种子 + 全量 AST 三元树拆分与符号擦除**：
   `bla-agents` 核心 AST 引擎（`src/shields/javascript/ast-shield.ts`）已将三元表达式种子从静态常量升级为 `process.hrtime.bigint()` 派生的奇偶与模 8 二次剩余双重数论不变量，彻底封死 `seed = 7` 静态常量折叠；同时在 `bankrupt` 档位下抹除全部局部函数/变量名语义并拆分全量业务字符串。

---

## 🎯 挑战规则与运行方式

### 1. 运行靶机

在仓库根目录下直接执行：

```bash
node challenge/bla-crackme.cjs <16位密钥>
```

当输入正确的 **16 位可打印 ASCII 密钥（Key）** 时，程序会通过全宽 32 字节 SHA-256 校验并派生流密钥解密打印出对应的 `FLAG{...}`。

### 2. 如何验证你拿到的是唯一「真 Flag」？

16 个可达 Slot 解密出的 `FLAG{...}` 中，只有 **1 个** 是真正的目标 Flag。请使用以下命令在本地核对 SHA-256 指纹：

```bash
# 将你拿到的 FLAG{...} 填入下方验证：
node -e 'console.log(require("crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' "FLAG{你的Flag}"
```

✅ **真 Flag 的唯一正确 SHA-256 指纹**：
```text
1884551c04263e216989cae238468ac988e57e772d8aaf739ff2b9913909609a
```

如果计算出的 SHA-256 与上方完全一致，恭喜你——你（或你的 Agent）成功穿透了 BLA v3.0 的全套蓝军护盾！欢迎在社区评论区或 [GitHub Issues](https://github.com/qybaihe/bla/issues) 晒出你的通关思路与耗时 / Token 账单！
