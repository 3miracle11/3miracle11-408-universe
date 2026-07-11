# 红宝书单元双语阅读

本目录计划收录 57 篇英语阅读材料：

- `articles/required/`：必考词 Unit 1-26
- `articles/basic/`：基础词 Unit 1-31
- `source/units.json`：从用户提供的扫描版 PDF 提取的单元词表与 OCR 核验信息
- `scripts/generate_articles.py`：使用 GitHub Models 生成、修正和校验文章

每篇文章包含英文原文、完整中文译文、规范化词表、OCR 修正记录和覆盖率报告。文章为原创学习材料，不复制词书释义或例句。

## 质量标准

1. 每个 Unit 对应一篇独立文章。
2. 英文原文自然使用该 Unit 的全部规范化词汇。
3. 每篇提供完整中文译文。
4. 生成器会检查词汇覆盖；缺词时自动要求模型修订。
5. 明显的 OCR 错拼会记录在文章末尾，方便追溯。
