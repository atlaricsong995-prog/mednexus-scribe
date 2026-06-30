# MedNexus Scribe — MVP 手動測試指南（Day 1–6）

> 這份是「**你需要自己用瀏覽器 / 麥克風親手測**」的部分（我這邊已用腳本對 live Supabase 跑過 API + realtime，但錄音、UI、三端同步這些只有人能看）。
> 每一步都有 **操作** 與 **應該看到的結果 ✅**。看到不一樣的，把那一步的編號 + 畫面丟給我。

---

## 🆕 臨床擬真強化更新（2026-06-30）

> **這一輪 = 測 Script A 時發現的六個臨床邏輯修正。** 設計文件：`docs/superpowers/specs/2026-06-30-clinical-escalation-override-realism-design.md`。
> **狀態：全部完成、tsc + lint 乾淨、已 commit（`00dc436`）。無需 migration**（全部沿用既有欄位 / jsonb / audit_log）。

**A. Override 必填原因**：過敏（critical）旗標下，**沒寫原因不准 dispatch**（前後端雙重把關）。醫生的 override 原因會**一起推到護士 MAR 徽章**（原本只顯示「為什麼危險」，現在加「醫生為什麼仍開」）。warning 旗標原因仍選填。

**B. 觀測分流**（新檔 `src/lib/clinical/obs-routing.ts`，確定性、不走 LLM）：常規生命徵象（BP/HR/temp/SpO₂）且**無特殊時點/條件 → 不再生重複 task**（grid 已涵蓋）；有條件/特殊時點（如「服藥後 1hr 量 BP」）或非常規觀測（血糖）→ 照常進 Special Instructions / 可填值 task。

**C. 兩段閾值 + 自動 escalate**：`OBSERVATION_CATALOG` 每項加 **critical 內帶** + `obsSeverity()`。護士記錄值進 critical 帶 → **自動寫 escalation 到主治 inbox**（沿用現有 realtime）。輕度 abnormal 只變紅、**不通知**（避免 alert fatigue）。grid cell 與血糖 obs 共用同一條規則。
- critical 帶：血糖 `<3 或 >20`、SBP `>180`/`<80`、DBP `>110`/`<50`、SpO₂ `<90`、temp `>39.5`、HR `<40`/`>130`、RR `<8`/`>30`。
- **escalation 依 catalog critical 帶觸發**，不解析口述自訂閾值（口述「>15」只當 Special Instruction 顯示文字）。

**D. MO propose 理由**：propose 面板加**選填「Reason / 臨床 rationale」**，顯示在主治審批卡（`Rationale: …`，藍字）。多筆 order 維持一次一筆連續送。

**E. 給藥注意事項**：`Medication` 加選填 `admin_instruction`（飯前/隨餐/飯後/空腹/at night），Gemini 抽取 + 開藥 UI 可選，**併入 MAR 列標籤顯示給護士**。純 advisory，**不改排程**。

**✅ 瀏覽器實測通過（live）：**
- **C**：床 12 路由表 BP 格填 **200/120** → toast「Abnormal value recorded」→ 切 `/doctor` inbox 出現 **「Auto-Monitor · escalated — Critical Blood pressure 200/120 mmHg — auto-escalated」**。
- **D**：`/mo` 床 12 propose **Amlodipine** + 理由「BP 200/120 — uptitrate antihypertensive」→ `/doctor` 審批區出現 **「Amlodipine · proposed by resident · Rationale: …」** + Authorise。
- console 無錯誤。

**⏳ 待 Script A 重錄驗證**：A（override 原因閉環）、B（分流）、E（admin instruction 抽取 + MAR 顯示）走的是 **口述→草稿→派發** 管線，需錄音才看得到 live，由 Script A 重錄涵蓋。
**🧹 實測留下的資料**（床 12 / MRN001）：一筆 16:00 BP 200/120 charted、一筆 pending 的 Amlodipine resident proposal——重錄 Script A 前可忽略或自行清掉。

---

## 🆕 Day 6 更新紀錄（2026-06-27）

> **Day 6 = 臨床治理強化 + 精準度/體驗優化。** 全程實測了多輪完整閉環。
> **狀態：全部完成、已 commit 並 push** —— `origin/main @ 0568620`，共 7 個 Day 6 commit。
> **migration 003（`tasks.safety_alert`）已套用到 live DB**，不需再手動跑。

**✅ 安全 / 治理：**
- **完整閉環實測通過**：錄音 → Whisper → Gemini → 安全旗標 → override 關卡（沒簽不准派發）→ 派發 task → realtime 推到 `/nurse` → 護士回報數值 → 醫生 Approve → 閉環關閉，稽核軌跡完整。
- **編輯後安全重算（D-008 強化）**：安全檢查改成在**確認當下依編輯後藥單重算**（新檔 `src/lib/safety.ts`，6 個測試案例通過）。移除危險藥 → 旗標自動消失（不再假警報）；新增危險藥 → 補旗標（不再漏報，最危險的那種）。
- **護士端過敏徽章（新功能）**：醫生 override 過敏藥派發後，該藥的護士任務卡顯示**紅色「Allergy / safety override」徽章 + 紅框**，升為 high 優先級；指揮塔 banner 也列出。

**✅ 多語：**
- **華語輸入支援**：華語錄音 → 輸出**統一英文病歷**成立。Whisper 提示詞加藥名 / 馬來文 / **中文**醫療詞；Gemini 強制全英文輸出。（廣東話/福建話 Whisper 不支援，維持華語。）

**✅ 精準度 / 體驗優化（第二輪，全部實測驗證）：**
- **`extracting…` 卡住修正**：`gemini-3-flash-preview` 預設開 thinking，萃取偶爾暴衝到 **170–215 秒**、卡死畫面。關閉 `thinkingBudget` → 約 **4 秒**、穩定（安全旗標 server 端會重算，不靠 Gemini 推理）。
- **「Encik」被聽成「Inject」修正**：Whisper prompt 偏置不夠力，加了**轉錄後確定性修正**——只在已知誤聽詞直接接病人姓名 token 時，換回病人正確敬稱（雙錨點，`inject insulin` 等正常用法不誤傷）。實測現在讀「Encik Lim」。
- **劑量數字修正**：Gemini 曾把安全規則裡的「max 2000mg」門檻誤當劑量。加**防火牆規則**：劑量只准取自逐字稿、嚴禁挪用門檻數字。實測錄音現在正確顯示 **Metformin「1g」、Augmentin「625mg」**。
- **指揮塔 Live feed 空白修正**：feed 原本只記「訂閱後」事件，整輪跑完才開控制塔就一片空白。改成用既有 task **回填**，打開即見近期活動（realtime 送達本身正常，已無頭驗證）。

**🐛 早先修好的：**
- 指揮塔「0 active tasks」：Next fetch 快取凍住空結果 → `admin.ts` 全查詢 `no-store`。
- 麥克風錯誤訊息：「could not recording」改成精準提示（找不到麥克風 / 被佔用 / 權限 / 非 HTTPS）。

**⏳ 已知限制：** Whisper 對**數字**仍非 100%（曾 158→32、1g→2000）。靠三層緩解：醫生審閱 + Gemini 劑量防火牆 + 不確定時 `VERIFY:` 提示；但仍建議人眼確認劑量。

---

## 0. 開始前準備

| 項目 | 怎麼做 | 應該看到 ✅ |
|---|---|---|
| 啟動 App | 終端機 `cd ~/Desktop/Claude/mednexus-scribe && npm run dev` | `Local: http://localhost:3000` |
| 開三個視窗 | 同一台電腦開 **3 個瀏覽器分頁/視窗**（建議其中一個用無痕，模擬不同裝置）。最佳：手機開 `/nurse`、電腦開 `/doctor` + `/control-tower` | 三頁都能載入 |
| 麥克風權限 | 進 `/doctor` 第一次按錄音時，瀏覽器會問麥克風權限 → **允許** | 紅色錄音鈕開始計時 |

> ⚠️ **建議測試順序**：先把 `/nurse` 和 `/control-tower` 兩頁**先開著**，再去 `/doctor` 操作。原因：realtime channel 要先「暖機」，剛訂閱後 1 秒內的第一個事件偶爾會漏（重新整理該頁即可補上 server 端初始資料）。

> 💡 用的是 **Ward 5A**，6 位病人：床 12 Encik Lim（**對 penicillin 過敏**）、13 Puan Siti Aminah（CHF）、14 Mr. Raj Kumar（對 aspirin 過敏）、15 Ms. Tan、16 Encik Hassan、17 Mrs. Chong。

---

## 1. Landing 角色選擇（`/`）

**操作**：開 `http://localhost:3000`

**應該看到 ✅**
- 標題 **MedNexus Scribe** + 三張卡：**Doctor / Nurse / Head Nurse**
- 按任一張 **Enter as …** → 進到對應頁面（`/doctor`、`/nurse`、`/control-tower`）
- 每個內頁左上角有 **← Switch role** 可回來

---

## 2. Doctor — 病人清單與錄音（`/doctor`）

**操作**
1. 進 `/doctor`
2. 看病人清單
3. 點 **床 13 Puan Siti Aminah**（先測「正常」案例）

**應該看到 ✅**
- 清單顯示 6 位病人，每張卡有床號、姓名、年齡、診斷；過敏的病人（床 12、14）有黃色過敏標籤
- 進病人詳情頁：上方病人摘要 + 下方大麥克風鈕「Dictate note」

---

## 3. Doctor — 完整 AI pipeline（語音 → 卡片）✦ 核心

> 對著麥克風念下面這段（**英文最穩**；想測多語見 §3b）。

**🎙️ 口述腳本（床 13，正常案例）**
> "Mrs Siti Aminah, congestive heart failure, getting more short of breath today.
> Start furosemide forty milligrams IV twice daily for three days.
> Nurse to monitor blood pressure every four hours; if systolic below ninety, call the MO.
> Strict input output charting hourly."

**操作**：按麥克風 → 念完 → 按停止 (■) → 按 **Upload & analyze**

**應該看到 ✅**（依序）
1. 進度：Saving recording… → Transcribing to English… → Extracting clinical note…（總共約幾秒）
2. **English transcript** 區塊出現逐字稿（即使你念混語也應是英文）
3. **4 張卡片**：
   - **Clinical note**：chief complaint / HPI / exam / assessment / plan 都有內容；下方可能有 ICD-10 標籤（如 I50.x）
   - **Medications**：至少 1 筆 **Furosemide**，含 drug/dose/route/freq/duration 五欄
   - **Nurse tasks**：≥2 筆，含 priority 標籤 + when + conditions（如「If systolic below 90 call MO」）
   - **Safety flags**：綠色「No safety flags」（這個案例沒過敏衝突）
4. 卡片**可編輯**：改任一欄位、按 **+ Add medication / + Add task**、垃圾桶圖示可刪一列、task 的 priority 是下拉選單

> ❗ 重點：醫生**沒念到的藥不該自己冒出來**（例如不該因為病人有 CHF 就自動加上家用藥）。若看到幻想的藥，記下來給我。

---

## 3b.（選測）多語輸入 — Task 3.6

念混語，確認逐字稿仍輸出**英文**：
> （BM）"Pesakit ini demam tinggi, bagi paracetamol satu gram empat kali sehari."
> （中）「病人發燒，給 paracetamol 一公克，一天四次。」

**應該看到 ✅**：transcript 是英文、Medications 出現 Paracetamol 1g QID。
> 這是已知待補的真實樣本測試，結果好壞都請回報給我。

---

## 4. D-008 用藥安全攔截 ✦ Demo 高潮

> 換 **床 12 Encik Lim Ah Kow（對 penicillin 過敏）**。

**🎙️ 口述腳本（床 12，過敏衝突案例）— 2026-06-30 更新，涵蓋擬真強化 A/B/C/E**
> "Encik Lim, post-op day two, looks like a wound infection.
> Start Augmentin six twenty five milligrams three times a day for five days, take with food.
> Paracetamol one gram four times a day for pain.
> Check capillary blood glucose four times a day; if it is very high or very low, escalate to me.
> Nurse to monitor temperature every four hours."

**操作**：錄音 → Upload & analyze → 看 Safety flags 卡 → 試著按 Confirm

**應該看到 ✅**
1. **Safety flags 卡變紅**，出現一條 **critical · allergy · Augmentin**：理由提到 penicillin 過敏交叉反應
2. **（E）Augmentin 那一列出現 `Admin` 欄 = `with food`**（Gemini 抽到「take with food」；沒抽到可手動下拉選）
3. Confirm 區出現紅色 **「Override required (D-008)」** 勾選框
4. **不勾就不能 dispatch**：Confirm 鈕 disabled
5. **（A 新規則）勾選後仍 disabled** —— 必須**填寫 override 原因**（框會標紅、下方紅字「Enter a reason…」）；**填了原因 Confirm 鈕才亮**。這是這一輪的重點改動：過敏覆蓋沒寫原因不准派發。

> **（B 預期）** 「monitor temperature every four hours」是常規生命徵象 + 常規頻率 → **不會**多生一張獨立 temperature task（路由表 q4h 已涵蓋）。「check blood glucose」是非常規觀測 → 會進 **Special instructions** + 一張可填值的 glucose obs task。

---

## 4b.（新）自動升級 escalation ✦ 擬真強化 C

> 承 §4：dispatch 床 12 那份 note（記得先填 override 原因）。然後到 `/nurse` 床 12。

**操作（護士端）**
1. **（A 閉環）** MAR 的 **Augmentin 列紅色徽章**：除了「為什麼危險」，現在還附上**醫生的 override 原因**（`Doctor's override reason: …`）。
2. **（E）** Augmentin MAR 列標籤含 **`· with food`**。
3. **（C 測 escalate）** 在路由表把任一格 **血壓填 200/120**（或在 glucose obs task 填 **2.5**）→ Submit。

**應該看到 ✅**
- toast「Abnormal value recorded」，該格變紅。
- 切到 `/doctor` 頂部 **alert inbox** 自動出現一條：**「Auto-Monitor · escalated — Critical Blood pressure 200/120 mmHg — auto-escalated」**（glucose 2.5 則是「Critical Blood glucose 2.5 …」）。
- **對照**：填**輕度異常**（如 BP 150/95、glucose 12）→ 只變紅、**不**進 inbox（避免 alert fatigue）。

> critical 帶：血糖 `<3 / >20`、SBP `>180 / <80`、SpO₂ `<90`、temp `>39.5` … escalation 依**系統 critical 帶**觸發，不解析口述的自訂門檻（口述「very high/low」只當 Special Instruction 顯示文字）。

---

## 5. Confirm & Dispatch（醫生送出）

**操作**：在任一份 note（用 §3 床 13 那份最乾淨）→ 按 **Confirm & dispatch**

**應該看到 ✅**
- 出現綠色 **「Confirmed & dispatched · N tasks now live…」**
- 右上角 toast「Note confirmed · N task(s) dispatched」
- （這時 `/nurse` 那頁應該幾乎同時跳出新任務 — 見 §6）

---

## 6. Nurse — 即時收任務 + 完成（`/nurse`）

> 這頁要在 §5 dispatch **之前**就開著，才看得到即時跳出。

**應該看到 ✅（dispatch 當下）**
- 右上角狀態變 **🟢 Live**
- **不用重新整理**，任務卡在 1–2 秒內自動出現；右上角跳 toast「New task dispatched」（critical 的會是「🔴 New critical task」）
- 每張 TaskCard：priority 配色、床號、描述、條件（黃底）、排程時間（若有）

**操作（完成任務）**：挑一張任務 → 按 **Mark complete** → 在彈窗填「結果/數值」（例：`BP 128/82 mmHg`）+ 選填 notes → **Submit**

**應該看到 ✅**
- toast「Task submitted · Sent to the doctor for approval」
- 該卡狀態變 **Awaiting approval**（橘色），顯示你填的數值

---

## 7. Doctor — 審批（`/doctor`）

> 護士 Submit 後，回到 `/doctor`（這頁開著的話會即時更新）。

**應該看到 ✅**
- `/doctor` 頂部出現橘色 **「N task(s) awaiting your approval」** 面板，列出剛剛護士送出的任務 + 數值
- 同時跳 toast「Task ready for approval」

**操作**：按該任務的 **Approve**

**應該看到 ✅**
- toast「Approved · Task closed」
- 該項從待審面板消失
- `/nurse` 那張卡幾乎同時變綠色 **Approved**

---

## 8. Control Tower — 全局視圖（`/control-tower`）

> 全程開著這頁，邊做 §5–§7 邊看。

**應該看到 ✅**
- **Ward grid**：每床一格，顯示床號、病人名、active 任務數；底色會變：
  - 🟢 綠 = 無未結任務｜🟡 黃 = 有任務在進行｜🔴 紅 = 有 critical 未結
- **Live feed**（右欄）：每個事件即時冒出一行，含時間 + 標籤：
  - `dispatch`（醫生送出）→ `submit`（護士完成）→ `approve`（醫生批准）
- 若有 critical 未結任務 → 上方紅色 **Alert banner** 列出該任務
- 右上角顯示 **🟢 Live**
- 這頁**純唯讀**（沒有任何可按的操作按鈕）

---

## 9. 全閉環三端同步 ✦ 這就是 demo 的賣點

把 §5 → §6 → §7 連起來一次做完，**同時盯著三個畫面**：

| 動作（Doctor） | Nurse 畫面 | Control Tower 畫面 |
|---|---|---|
| Confirm & dispatch | 任務即時跳出 + toast | grid 該床變色、feed 出現 `dispatch` |
| —（Nurse 按 Mark complete + Submit） | 卡變「Awaiting approval」 | feed 出現 `submit` |
| Approve | 卡變綠「Approved」 | feed 出現 `approve`、grid 該床轉綠 |

**應該看到 ✅**：每次動作，**另外兩個畫面在 ~1–2 秒內自動更新**，全程不用重新整理。

---

## 10.（選測）稽核軌跡 Audit — 治理賣點

到 **Supabase Dashboard → Table editor → `audit_log`**，依時間排序。

**應該看到 ✅**：每個動作都有一筆 append-only 紀錄：
- `create_recording` → `transcribe` → `extract_note` → `confirm_note` → `complete_task` → `approve_task`
- `confirm_note` 那筆的 `metadata` 若有 override，會含 `safety_override: true` + `override_reason`

---

## 11.（選測）行動裝置 / iPad — Task 2.7

用手機或 iPad Safari 開 `/doctor` 的某病人頁，實際錄音一次。

**應該看到 ✅**：能錄音、能跑完 pipeline、卡片排版在窄螢幕不爆版。
> iOS Safari 錄出來是 m4a/mp4，後端已處理；若失敗把錯誤截圖給我。

---

## 已知小現象（不是 bug）
- **Realtime 冷啟動**：剛打開 `/nurse` 或 `/control-tower` 後 ~1 秒內的第一個 *live* 事件偶爾會漏。對策：那兩頁**先開著等暖機**，或漏了就重新整理（server 端初始資料會補齊狀態）。指揮塔 Live feed 現在會**回填既有 task**，所以就算流程跑完才打開也看得到近期活動，不再一片空白。
- 同一台電腦的多個分頁共用同一個 realtime 連線，行為正常；要更像「多裝置」可用無痕視窗或不同瀏覽器。
- 重複操作會累積很多 approved 任務，畫面會變長 —— demo 前想清空可跟我說，我給你一段清資料的 SQL（保留 audit_log）。

---

## 回報格式（出問題時）
> 步驟編號 + 你做了什麼 + 預期 vs 實際 +（截圖／console 紅字／network 失敗請求）。
> 例：「§6 dispatch 後 nurse 沒跳任務，重新整理才有，console 無紅字」。
