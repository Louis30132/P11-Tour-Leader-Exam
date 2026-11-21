# P11-Tour-Leader-Exam：外語領隊（英語）考照練習

電腦、手機都能開的網頁 App（PWA），內容是觀光署導遊人員及領隊人員評量測驗的歷屆試題，每題都有解析。

## 功能
- **隨機練習**：選科目、年度、題數，答完一題馬上顯示對錯和解析
- **模擬考**：照正式題數與時間計時（實務、法規、資源各 50 題 60 分鐘；英語 80 題 80 分鐘），交卷後逐題檢討
- **錯題本**：答錯的題目自動收進來，連續答對 2 次後移出
- **弱點分析**：各科、各主題的答對率，以及模擬考紀錄
- 作答紀錄存在瀏覽器裡；換裝置時用「匯出／匯入紀錄」搬移

## 題庫來源
| 來源 | 年度 | 狀態 |
|---|---|---|
| 觀光署考畢試題 https://register-exam.tad.gov.tw/tourism/ExamQandA | 115 | ✅ 四科 230 題含解析 |
| 同上（歷年考畢試題 ExamQandAh） | 113、114 | 待加入 |
| 考選部考畢試題平臺（舊制，112 年以前） | ～112 | 待加入（實務、資源、英文可沿用） |

英語通用制領隊的科目代號：1101 執業實務、2101 執業法規、3201 觀光資源、4201 英語（各年代號可能不同，以網頁為準）。
試題不受著作權保護（著作權法第 9 條），公開使用時仍會註明出處。

## 資料夾
```
source/<年度>/      觀光署原始 PDF（試題 Q、答案 A、更正答案 AN）
data/raw/           PDF 解析出來的題目＋答案（tools/parse_pdf.py 產生）
data/explain/       解析與主題分類（人工／Claude 撰寫；"r":1 表示待查核）
app/                網頁 App 本體（要部署的就是這個資料夾）
app/data/bank.json  合併後的題庫（tools/build_bank.py 產生）
tools/              轉檔、合併、產生圖示的腳本
```

## 新增一年題目的流程
1. 下載 PDF 到 `source/<年度>/`。網站會檢查來源，要先開過 ExamQandA 頁面取得 cookie，下載時帶上 Referer
2. `python tools/parse_pdf.py <年度> <代號> <科目key>`，科目 key 為 practice / law / resources / english
3. 在 `data/explain/<年度>-<科目key>.json` 寫解析
4. `python tools/build_bank.py`
5. 把 `app/` 重新部署

## 本機預覽
```
python -m http.server 8611 --directory app
```
然後開啟 http://localhost:8611
