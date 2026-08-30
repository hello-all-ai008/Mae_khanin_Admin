# รายงานสรุปสถานะหน้าสแกนนักวิ่ง (Check-in, Check Point, Finish Line)
**วันที่:** 30 สิงหาคม 2026  
**โปรเจกต์:** `Mae_khanin_Admin`  
**ไฟล์ที่เกี่ยวข้อง:** 
- [CheckIn.jsx](file:///D:/Tiw/Project_Trail_Running_Hub/Mae_khanin_Admin/src/pages/CheckIn.jsx)
- [CheckPoint.jsx](file:///D:/Tiw/Project_Trail_Running_Hub/Mae_khanin_Admin/src/pages/CheckPoint.jsx)
- [FinishLine.jsx](file:///D:/Tiw/Project_Trail_Running_Hub/Mae_khanin_Admin/src/pages/FinishLine.jsx)
- [RaceContext.jsx](file:///D:/Tiw/Project_Trail_Running_Hub/Mae_khanin_Admin/src/context/RaceContext.jsx)
- [ScannerInput.jsx](file:///D:/Tiw/Project_Trail_Running_Hub/Mae_khanin_Admin/src/components/ScannerInput.jsx)
- [PreloadDataCard.jsx](file:///D:/Tiw/Project_Trail_Running_Hub/Mae_khanin_Admin/src/components/PreloadDataCard.jsx)
- [DatabaseFlow.jsx](file:///D:/Tiw/Project_Trail_Running_Hub/Mae_khanin_Admin/src/pages/DatabaseFlow.jsx) (เอกสารอ้างอิงฐานข้อมูล)

---

## 1. ภาพรวมสิ่งที่พัฒนาไปแล้ว (Implemented Features)

### 1.1 หน้าจอและส่วนประกอบหลัก (UI / UX)
1. **ระบบสแกนบาร์โค้ด & กล้อง (Scanner Engine):**
   - รองรับการยิงด้วย **Barcode Scanner (USB/Bluetooth)** โฟกัสอัตโนมัติ กด Enter ทันที
   - รองรับ **Web Camera Scanner (Html5Qrcode)** สแกนได้ทั้งบาร์โค้ด 1D (Code 128, Code 39, EAN, UPC, ITF) และ QR Code 2D
   - มีระบบควบคุมกล้องขั้นสูง: ซูมกล้อง (Hardware Zoom 1x - 3.5x), เปิด/ปิดไฟแฟลช (Torch), สลับกล้องหน้า/หลัง, ปรับอัตราส่วนภาพ (16:9, 4:3, 1:1) และกรอบสแกน
   - มีระบบเสียง Beep Feedback เมื่อสแกนสำเร็จ
2. **ระบบเลือกตัวตนผู้สแกน (Staff / Operator Selection):**
   - สามารถระบุชื่อเจ้าหน้าที่ประจำจุด (Operator) ที่กำลังทำการสแกนได้ และมีปุ่มกดเพิ่มชื่อเจ้าหน้าที่ใหม่เข้าสู่ระบบได้ทันที
3. **กระดานแสดงผล LED จำลอง (LedBoard):**
   - แสดงข้อมูลนักวิ่งขนาดใหญ่ทันทีเมื่อสแกน: BIB, ชื่อ-นามสกุล, ระยะทาง, เพศ, อายุ, สัญชาติ และเวลาที่สแกน
   - แสดงสถานะสีเขียว (ผ่าน) / สีส้ม-แดง (เตือนซ้ำ หรือ ไม่พบข้อมูล)
4. **ตารางประวัติการสแกนล่าสุด (Recent Scan Log):**
   - แสดงรายการ 5 คนล่าสุดที่สแกนในจุดนั้นๆ พร้อมเวลา หมายเลข BIB ชื่อ และชื่อผู้ทำการสแกน
5. **ระบบ Preload & Offline Cache Bar (PreloadDataCard):**
   - ปุ่มกดดาวน์โหลดข้อมูลนักวิ่งล่วงหน้าเข้าสู่หน่วยความจำเครื่อง (`localStorage`) เพื่อให้สามารถสแกนในจุดอับสัญญาณเน็ตได้ 100%
   - แสดงสถานะความพร้อมของข้อมูล (100% Ready / Offline Mode)

---

### 1.2 สถาปัตยกรรมการประมวลผล (0ms Decoupled Architecture)
- **แยกกระบวนการสแกนออกจาก Database โดยเด็ดขาด:**
  - เมื่อยิงบาร์โค้ด ระบบจะค้นหาและตรวจสอบสิทธิ์ในหน่วยความจำเครื่อง (In-memory Cache) ทันทีใน **0 วินาที** โดยไม่ต้องรอการตอบกลับจาก Network หรือ Database
  - อัปเดตสถานะในหน้าจอ, เสียงแจ้งเตือน, กระดาน LED แบบ Synchronous ทันที ทำให้การสแกนต่อเนื่องลื่นไหล ไม่กระตุก
- **ระบบ Background Sync Queue Worker:**
  - ผลการสแกนที่ถูกต้องจะถูกบรรจุเข้าคิว `pendingSyncQueue` และเซฟลง `localStorage` ทันที ป้องกันข้อมูลสูญหายเมื่อปิดแท็บหรือเครื่องดับ
  - มี Worker เบื้องหลังคอยดึงคิวไปทยอยอัปเดตลง Supabase Database แบบ Asynchronous อัตโนมัติ
  - มีระบบ Auto-Retry และ Auto-Resume ทันทีเมื่อสัญญาณเน็ตกลับมาต่อติด

---

## 2. สถานะการเชื่อมต่อฐานข้อมูล (Database Connection Status)
*เปรียบเทียบกับตารางตามที่ระบุใน [DatabaseFlow.jsx](file:///D:/Tiw/Project_Trail_Running_Hub/Mae_khanin_Admin/src/pages/DatabaseFlow.jsx)*

| ตารางใน ERD | สถานะปัจจุบัน | การทำงานในโค้ด | หมายเหตุ / จุดที่เชื่อมต่อ |
| :--- | :---: | :--- | :--- |
| **`EVENTS`** | ✅ เชื่อมต่อแล้ว | `supabase.from('events').select('id, name')` | ดึงรายชื่องานวิ่งมาใส่ใน Dropdown เลือกงาน (`selectedEventId`) ของทั้ง 3 หน้า |
| **`CATEGORIES`** | ✅ เชื่อมต่อแล้ว | `supabase.from('categories').select('*').eq('event_id', ...)` | ดึงข้อมูลระยะทางและเวลาปล่อยตัวใน `preloadEventData` |
| **`STATIONS`** | ✅ เชื่อมต่อแล้ว | `supabase.from('stations').select('id, name, type')` | ดึงรายชื่อจุดสแกนมาแสดงใน Dropdown ของหน้า Check Point |
| **`CHECKPOINT`** | ✅ เชื่อมต่อแล้ว | `supabase.from('checkpoint').select('id, category_id, station_id, cutoff_time, ...')` | ดึงข้อมูลเส้นทางและเวลา Cutoff เพื่อคำนวณ Gun Time |
| **`STAFF`** | ✅ เชื่อมต่อแล้ว | `supabase.from('staff').select('*')` และ `insert()` | ดึงรายชื่อเจ้าหน้าที่มาแสดงในช่องเลือกผู้สแกน และบันทึกเจ้าหน้าที่ใหม่ |
| **`RUNNERS`** (Read) | ✅ เชื่อมต่อแล้ว | `supabase.from('runners').select('*').eq('event_id', ...)` | ดาวน์โหลดข้อมูลนักวิ่งทั้งหมดของงานมาเก็บใน Local Cache |
| **`RUNNERS`** (Check-in) | ✅ เชื่อมต่อแล้ว | `supabase.from('runners').update({ registration_status: 'CHECKED_IN', checked_in_at, checked_in_by })` | ส่งข้อมูลเช็คอินผ่าน Background Sync Queue |
| **`RUNNERS`** (CP) | ✅ เชื่อมต่อแล้ว | `supabase.from('runners').update({ cps })` | อัปเดต JSONB เวลาผ่าน CP ของนักวิ่งใน Background Sync Queue |
| **`RUNNERS`** (Finish) | ✅ เชื่อมต่อแล้ว | `supabase.from('runners').update({ finish })` | อัปเดตเวลาเข้าเส้นชัยใน Background Sync Queue |
| **`SCAN_LOGS`** | 🟡 เชื่อมต่อบางส่วน | `supabase.from('scan_logs').insert([{ runner_id, station_id, scan_time, is_valid: true, scanned_by }])` | ส่งเฉพาะรายการที่สแกนผ่าน ยังไม่ได้ส่งรายการที่ไม่ผ่าน (Invalid/Duplicate) |
| **`LOCATIONS`** | ❌ ยังไม่ได้เชื่อม | — | ยังไม่ได้นำ `location_id` มาผูกในการสแกนจุดต่างๆ |
| **`USERS`** | ➖ ไม่ต้องผูกตรง | — | ผูกผ่าน `RUNNERS.user_id` อยู่แล้ว ไม่กระทบหน้าสแกน |
| **`ACTION_LOGS`** | ❌ ยังไม่ได้เชื่อม | — | สำหรับ Audit Log แอดมิน ไม่เกี่ยวกับหน้าสแกนสนาม |

---

## 3. สิ่งที่ยังขาด และข้อเสนอแนะในการพัฒนาต่อ (Missing & Next Steps)

### 3.1 ด้าน Database & Data Schema
1. **การบันทึก `SCAN_LOGS` ให้ครอบคลุมทุกกรณี:**
   - ปัจจุบันบันทึกเฉพาะกรณีสแกนผ่าน (`is_valid: true`) 
   - **สิ่งที่ควรเพิ่ม:** เมื่อสแกนไม่ผ่าน (เช่น "ไม่พบ BIB", "ยังไม่เช็คอิน", "สแกนซ้ำ") ควรส่งบันทึกลง `SCAN_LOGS` ด้วยโดยตั้ง `is_valid: false` พร้อมใส่ `note` เพื่อให้แอดมินตรวจสอบย้อนหลังได้ว่าเกิดปัญหาอะไรที่จุดไหน
2. **โครงสร้างคอลัมน์ `cps` และ `finish` ในตาราง `RUNNERS`:**
   - ต้องตรวจสอบใน Supabase ว่าตาราง `RUNNERS` มีคอลัมน์ `cps` (ประเภท `jsonb`) และ `finish` (ประเภท `bigint` หรือ `timestamp`) หรือยัง หากยังไม่มีคำสั่ง update อาจจะเกิด Error ในหลังบ้าน
3. **การดึงและผูก `location_id`:**
   - หากต้องการพิกัด GPS หรือสถานที่ของจุดตรวจตาม Schema ควรเพิ่มการระบุ `location_id` แนบไปใน `SCAN_LOGS`

### 3.2 ด้านฟังก์ชันและ Business Logic
1. **ระบบตรวจสอบ Cutoff Time (DNF Notification):**
   - หน้า `CheckPoint.jsx` และ `FinishLine.jsx` มีข้อมูล `cutoff_time` จากตาราง `CHECKPOINT` อยู่แล้ว แต่ยังไม่ได้ใส่ Logic แจ้งเตือนบนหน้าจอว่านักวิ่งคนนี้ "เกินเวลา Cutoff (DNF)" หรือไม่
2. **ระบบ Realtime Sync ระหว่างจุดสแกน (Supabase Realtime Channel):**
   - ปัจจุบันแต่ละจุดดึงข้อมูลผ่าน Preload Cache ในเครื่องตัวเอง หากเจ้าหน้าที่ที่จุด A1 สแกนผ่านแล้ว จุด A2 จะยังไม่เห็นข้อมูลจนกว่าจะกดปุ่มรีเฟรชข้อมูลล่าสุด
   - **สิ่งที่ควรเพิ่ม:** เปิดใช้ `supabase.channel('realtime_runners')` เพื่อให้อัปเดตข้อมูลนักวิ่งข้ามเครื่องกันแบบ Live ทันทีเมื่อมีสัญญาณเน็ต
3. **ปุ่ม Re-print หรือออก E-Slip เส้นชัย:**
   - หน้า `FinishLine.jsx` สามารถเพิ่มปุ่มลัดสำหรับพิมพ์สลิปผลการแข่งขัน (E-Slip / Thermal Print Slip) หลังสแกนเข้าเส้นชัยได้ทันที
