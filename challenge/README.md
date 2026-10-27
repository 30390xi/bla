# 🛡️ BLA CrackMe 公开挑战赛 v4.0 — 8-Layer Matryoshka (八层套娃深渊版)

欢迎来到 **BLA (`bla-agents`) 公开逆向挑战靶场 (v4.0 — 8-Layer Entangled Matryoshka Edition)**！

本目录下的 [`bla-crackme.cjs`](./bla-crackme.cjs) 是使用 `bla-agents v1.4.5` 全套武器库生成的独立 Node.js 靶机程序（零外部依赖，直接用 `node` 即可运行）。

欢迎各位佬友挂载 **REA**、**Claude Code (Opus)**、**Codex**、**Cursor**、**GLM-5.3**，或者亲自上阵手撕，看看能不能在不靠暴力穷举的前提下，一层一层剥开 8 层套娃拿到真正的 `FLAG{...}`！

---

## 🔥 v4.0 架构重构说明（二敬红队破阵佬友：从“单层校验”升级为“八层反 Hook 套娃”）

再次致敬社区红队佬友在 v3 Writeup 中展示的 **动态 Hook `node:crypto` + 14 字节前缀提取 + 模板找不同** 攻击链！

针对 v3 暴露出的“动态插桩直接绕过静态 AST 混淆”与“单层结构太浅”问题，**v4.0 八层套娃版**彻底摒弃了单层校验设计，改为**“零暴力穷举、纯靠一层一层往前逆向剥洋葱”**的 8 层强耦合架构：

1. **第 0 层：`node:crypto` 蜜罐陷阱（Active Crypto Honey-Sink）**：
   如果你继续像 v3 一样动态 Hook `node:crypto` 的 `createHash`，你依然会捕获到 528 次 `SHA-256("BLA-V4-SOVEREIGN:...")` 调用，也能顺利从 `honeyPrefix14` 解出 16 把密钥并拿到 16 个逼真的 `FLAG{..._2026_m4st3r}`——**但那 16 个全是为 `node:crypto` Hook 专门准备的蜜罐假 Flag！真正的验证与解密链路全程 0 次调用 `node:crypto`！**
2. **第 1 层：16 跳调用图迷宫状态机（16-Hop Call-Graph Labyrinth）**：
   128-bit 密钥状态分散穿过 16 个混入 388 条强连通分量（SCC）迷宫中的奇乘数旋转置换节点。
3. **第 2 层：无感反 Hook 与运行时自完整性纠缠（Silent Anti-Hook Key Entanglement）**：
   运行时不抛错、不退出，而是直接校验 `WebAssembly.Module/Instance`、`crypto.createHash`、`zlib.inflateRawSync` 原生函数描述符、`process.execArgv` / `NODE_OPTIONS` / `_preload_modules` 预加载钩子以及自身文件结构，派生出 32-bit 完整性密钥 `integrityKey32`。**一旦挂载 `--require` 钩子或篡改文件插入日志，程序不会报错，但 `integrityKey32` 会静默偏移，导致内层加密 WASM 解密失败（连输入真密钥都会静默返回 Access Denied）！**
4. **第 3 层：外层 6.87MB BLA 加固版 WebAssembly 8 轮 Feistel 虚拟机（Outer WASM VM）**。
5. **第 4 层：跨槽位有状态滚动异或累加器（Cross-Slot Stateful Rolling Split-Share）**：
   16 个槽位共享同一个原地突变的滚动异或状态机——`Slot 11` 的解锁状态严格依赖于 `Slot 0 .. Slot 10` 按序执行后留下的内存副作用，无法拆出单个槽位独立运行。
6. **第 5 层：运行时动态解密的“内层套娃 WebAssembly 模块”（Runtime-Decrypted Inner WASM）**：
   只有前 4 层在无 Hook 环境下完整跑通，才能用 `integrityKey32` 配合外层 WASM 算子在内存中实时解密并实例化隐藏的第二层 WebAssembly 模块。
7. **第 6 & 7 层：内层 WASM 12 轮非线性双射 + 36 轮全块雪崩逆推（零明文前缀落盘）**：
   彻底删除了 v3 的 `_sched14` 免费前缀！36 轮全块扩散（第 1+3+6 层）将 16 字节输入密钥完全打散，任何单比特变化都会雪崩影响全部 16 个输入字节——只有完整逆向并写出全部 6 层的数学逆变换，才能还原出 16 字节可打印 ASCII 密钥。
8. **第 8 层：纯 WASM 海绵函数（In-WASM 24-Round Sponge）与 32 个完全同构的 `FLAG{..._2026_m4st3r}`**：
   全部 16 个真槽位与 16 个蜜罐槽位解密出的 Flag **100% 同构**（统一为 50 字符 leet-speak 短语且全部以 `_2026_m4st3r` 结尾，绝无 `a0/b1/c2` 模板差异），唯有比对下方唯一目标 SHA-256 指纹才能验明正身。

---

## 🎯 挑战规则与验证方式

### 1. 运行靶机

```bash
node challenge/bla-crackme.cjs <16位密钥>
```

### 2. 验证唯一「真 Flag」的 SHA-256 指纹

```bash
node -e 'console.log(require("crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' "FLAG{你的Flag}"
```

✅ **真 Flag 的唯一正确 SHA-256 指纹**：
```text
1884551c04263e216989cae238468ac988e57e772d8aaf739ff2b9913909609a
```
