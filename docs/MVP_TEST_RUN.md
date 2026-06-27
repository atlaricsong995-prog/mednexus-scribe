# MedNexus Scribe — MVP 手動測試指南（Day 1–6）

> 這份是「**你需要自己用瀏覽器 / 麥克風親手測**」的部分（我這邊已用腳本對 live Supabase 跑過 API + realtime，但錄音、UI、三端同步這些只有人能看）。
> 每一步都有 **操作** 與 **應該看到的結果 ✅**。看到不一樣的，把那一步的編號 + 畫面丟給我。

---

## 🆕 Day 6 更新紀錄（2026-06-27）

> 這天全程實測了一遍完整閉環，修了 2 個真 bug、加了華語支援與用藥安全強化。**有一個必跑的資料庫 migration（見下方 ⚠️）。**

**✅ 這天驗證 / 完成的：**
- **完整閉環實測通過**：錄音 → Whisper → Gemini → 兩個安全旗標 → override 關卡（沒簽不准派發）→ 派發 4 筆 task → realtime 推到 `/nurse` → 護士回報數值 → 醫生 Approve → 閉環關閉，稽核軌跡完整。
- **華語輸入支援**：用華語錄音實測 → 輸出**統一英文病歷**成立。Whisper 提示詞加了藥名 / 馬來文 / **中文**醫療詞；Gemini 強制全英文輸出。（廣東話/福建話 Whisper 不支援，維持華語。）

**🐛 修好的 2 個 bug：**
1. **指揮塔 `/control-tower` 永遠顯示「0 active tasks」** —— Next.js fetch 快取把空結果凍住了。已讓 `admin.ts` 所有查詢 `no-store`。
2. **安全檢查只在萃取時跑一次，醫生編輯藥單後不重算** —— 造成「移除危險藥仍被擋（假警報）」和「新增危險藥不跳旗標（漏報，最危險）」。已改成在**確認當下依編輯後藥單重算**（新檔 `src/lib/safety.ts`，6 個測試案例通過）。

**🔴→🟢 護士端過敏徽章（新功能）：** 醫生 override 過敏藥派發後，該藥的護士任務卡會顯示**紅色「Allergy / safety override」徽章 + 紅框**，並升為 high 優先級；指揮塔 banner 也會列出。

**🎙️ 麥克風錯誤訊息：** 「could not recording」改成精準訊息（找不到麥克風 / 被佔用 / 權限 / 非 HTTPS 分別提示）。

**⚠️ 必跑一步（否則派發會報錯）：**
到 **Supabase Dashboard → SQL Editor** 貼上並 Run（冪等，可重跑）：
```sql
alter table public.tasks
  add column if not exists safety_alert text;
```

**⏳ 還沒做：** 以上改動（~9 個檔 + migration 003）**都還沒 git commit**；Whisper 對數字仍會聽錯（158→32/128），靠醫生審閱修正。

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

**🎙️ 口述腳本（床 12，過敏衝突案例）**
> "Encik Lim, post-op day two, looks like a wound infection.
> Start Augmentin six twenty five milligrams three times a day for five days.
> Paracetamol one gram four times a day for pain.
> Nurse to monitor temperature every four hours."

**操作**：錄音 → Upload & analyze → 看 Safety flags 卡 → 試著按 Confirm

**應該看到 ✅**
1. **Safety flags 卡變紅**，出現一條 **critical · allergy · Augmentin**：理由提到 penicillin 過敏交叉反應
2. Confirm 區出現紅色 **「Override required (D-008)」** 勾選框 + 一句「I have reviewed and accept clinical responsibility…」
3. **不勾就不能 dispatch**：Confirm 鈕是 disabled，下方有紅字提示
4. 勾選後（可填 override 原因）→ Confirm 鈕亮起

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
- **Realtime 冷啟動**：剛打開 `/nurse` 或 `/control-tower` 後 ~1 秒內的第一個事件偶爾會漏。對策：那兩頁**先開著等暖機**，或漏了就重新整理（server 端初始資料會補齊狀態）。
- 同一台電腦的多個分頁共用同一個 realtime 連線，行為正常；要更像「多裝置」可用無痕視窗或不同瀏覽器。
- 重複操作會累積很多 approved 任務，畫面會變長 —— demo 前想清空可跟我說，我給你一段清資料的 SQL（保留 audit_log）。

---

## 回報格式（出問題時）
> 步驟編號 + 你做了什麼 + 預期 vs 實際 +（截圖／console 紅字／network 失敗請求）。
> 例：「§6 dispatch 後 nurse 沒跳任務，重新整理才有，console 無紅字」。
