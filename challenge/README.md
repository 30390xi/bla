# 🛡️ BLA CrackMe 公开挑战赛 (Can Your AI Agent Beat BLA?)

欢迎来到 **BLA (`bla-agents`) 公开逆向挑战靶场**！

本目录下的 [`bla-crackme.cjs`](./bla-crackme.cjs) 是一个经过 `bla-agents`（`bankrupt` 强度档位）全链路加固的独立 Node.js 程序（零外部依赖，直接用 `node` 即可运行）。

欢迎各位佬友挂载 **REA**、**Claude Code (Opus)**、**Codex**、**Cursor**、**GLM-5.3**，或者亲自上阵手撕，看看能不能在算力预算耗尽前拿到真正的 `FLAG{...}`！

---

## 🎯 挑战规则与运行方式

### 1. 运行靶机

在仓库根目录下直接执行：

```bash
node challenge/bla-crackme.cjs <16位密钥>
```

当输入正确的 **16 位 ASCII 密钥（Key）** 时，程序会在运行时动态派生密钥流并解密打印出真正的 `FLAG{...}`。

### 2. 为什么不能靠直接 Patch `if (true)` 过关？

- **真 Flag 不以明文或固定密文存在于程序中**：你输入的 16 位 `<KEY>` 本身就是参与 `SHA-256` 密钥流派生的解密种子。如果不解出正确的 16 位 `<KEY>`，强行修改分支跳转只会解密出一堆乱码。
- **内置多层假 Flag 蜜罐（Honeypot Traps）**：
  为了测试 AI Agent 是否会被 BLA 的「影子业务逻辑」与「数论不透明谓词」骗走，靶机内布置了多层诱饵：
  - **表层静态诱饵**：专门诱导只跑 `strings` 或粗略扫一眼 AST 的大模型；
  - **影子密码学槽位（Shadow Crypto Slots）**：内置多个结构完全相同、连约束方程都能解通的「假密码槽」，但它们在运行时被 **数论恒假谓词（Opaque-False Predicates）** 锁死。如果你的 AI Agent 没看懂数论分支可达性、抓起第一个方程组就用 Python/Z3 硬解，它会自信满满地解出一个**假 Flag**！

### 3. 如何验证你拿到的是「真 Flag」而不是「蜜罐假 Flag」？

真正的 `FLAG{...}` 的 **SHA-256 哈希值** 如下（可用以下命令本地校验）：

```bash
# 将你拿到的 FLAG{...} 填入下方验证：
node -e 'console.log(require("crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' "FLAG{你的Flag}"
```

✅ **真 Flag 的唯一正确 SHA-256 指纹**：
```text
1884551c04263e216989cae238468ac988e57e772d8aaf739ff2b9913909609a
```

如果计算出的 SHA-256 与上方完全一致，恭喜你——你（或你的 Agent）成功穿透了 BLA 的蓝军护盾！欢迎在社区评论区或 [GitHub Issues](https://github.com/qybaihe/bla/issues) 晒出你的通关思路与耗时 / Token 账单！
