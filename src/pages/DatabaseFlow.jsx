import React, { useEffect } from 'react';
import mermaid from 'mermaid';
import { ExternalLink } from 'lucide-react';

export default function DatabaseFlow() {
  useEffect(() => {
    mermaid.initialize({ startOnLoad: false, theme: 'default' });
    mermaid.run({
      querySelector: '.mermaid-diagram'
    });
  }, []);

  return (
    <div className="page active" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 80px)' }}>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span className="eyebrow">System Architecture</span>
          <h1>Database Flow & Schema</h1>
          <p>แผนผังโครงสร้างฐานข้อมูล (ERD), ตารางข้อมูล และ Data Flow ของระบบ TrailTime</p>
        </div>
      </div>

      <div className="card" style={{ flex: 1, padding: '40px', borderRadius: 'var(--radius)', overflowY: 'auto' }}>
        <style>
          {`
            .db-content {
                font-family: 'IBM Plex Sans Thai', sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 1000px;
                margin: 0 auto;
            }
            .db-content h1, .db-content h2, .db-content h3 { color: #16181d; }
            .db-content h1 { border-bottom: 2px solid #e6e9ed; padding-bottom: 10px; margin-top: 0; }
            .db-content h2 { margin-top: 30px; color: #3346e0; border-left: 4px solid #3346e0; padding-left: 10px;}
            .db-content h3 { color: #2d3748; margin-top: 25px; }
            .db-content .mermaid-diagram { margin: 30px 0; display: flex; justify-content: center; overflow-x: auto; }
            .db-content table {
                width: 100%;
                border-collapse: collapse;
                margin: 15px 0 30px 0;
                font-size: 14px;
            }
            .db-content th, .db-content td {
                border: 1px solid #e6e9ed;
                padding: 12px;
                text-align: left;
            }
            .db-content th { background: #f7f8f9; font-weight: 600; }
            .db-content .code { font-family: monospace; background: #f1f3f5; padding: 2px 6px; border-radius: 4px; color: #e53e3e; }
            .db-content .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; background: #ebf4ff; color: #3182ce; }
          `}
        </style>
        <div className="db-content">
          <h1>Database Flow & Schema (TrailTime) - <span style={{ color: '#38a169', fontSize: '0.8em' }}>Multiple Events Supported</span></h1>
          <p>โครงสร้างฐานข้อมูลอัปเดตใหม่เพื่อรองรับการจัดงานวิ่งหลายๆ งานพร้อมกัน (Multiple Events) โดยมีการเพิ่มตาราง EVENTS และ USERS เพื่อแยกข้อมูลการจัดงานและข้อมูลส่วนตัวของนักวิ่งออกจากข้อมูลการสมัคร</p>
          
          <h2>1. Entity Relationship Diagram (ERD)</h2>
          <div className="mermaid-diagram">
            {`erDiagram
                EVENTS {
                    uuid id PK "รหัสงานวิ่ง"
                    string name "ชื่อของงานวิ่ง"
                    date start_date
                    date end_date
                    string status "DRAFT|PUBLISHED|COMPLETED"
                }

                USERS {
                    uuid id PK "ข้อมูลนักวิ่งหลัก (ใช้ข้ามงานได้)"
                    string name
                    string email
                    string phone
                    string gender
                    date birth_date
                    string nationality
                }

                RUNNERS {
                    uuid id PK "รหัสการสมัครในแต่ละงาน (Registration)"
                    uuid event_id FK
                    uuid user_id FK "nullable (ถ้าสมัครแบบไม่สร้าง Account)"
                    string bib "nullable, UNIQUE ต่อ event"
                    string title "คำนำหน้าชื่อ"
                    string name "ชื่อนามสกุล"
                    string gender "เพศ"
                    string age "อายุตัวเลข (ถ้ามี)"
                    string age_group "รุ่นอายุ"
                    string cat "ข้อมูลระยะทางเดิม (Raw string)"
                    float distance "ระยะทางที่แยกออกมา"
                    string unit "หน่วยของระยะทาง"
                    string cat_name "ชื่อรุ่น/ประเภทที่แยกออกมา"
                    string nat "สัญชาติ"
                    string payment_status "สถานะการชำระเงิน"
                    uuid category_id FK
                    string rfid_tag "nullable, map ตอนเช็คอิน"
                    string registration_status "PRE_REGISTERED|CHECKED_IN"
                    timestamp checked_in_at "nullable"
                    string checked_in_by "nullable"
                    timestamp created_at
                    timestamp updated_at
                }
            
                CATEGORIES {
                    uuid id PK "รหัสระยะวิ่ง"
                    uuid event_id FK
                    string name "e.g., MKT10"
                    float distance_km
                    string unit "e.g., km"
                }
                
                LOCATIONS {
                    uuid id PK
                    uuid event_id FK
                    string name
                    float latitude
                    float longitude
                    string url
                }
            
                STATIONS {
                    uuid id PK
                    uuid event_id FK
                    string name
                    string type "START|CP|FINISH"
                    int sequence_order
                }

                CHECKPOINT {
                    uuid id PK
                    uuid category_id FK
                    uuid station_id FK
                    int sequence_order "ลำดับของจุดสำหรับ category นี้"
                    timestamp cutoff_time "nullable"
                    timestamp created_at
                    timestamp updated_at
                }
            
                SCAN_LOGS {
                    uuid id PK
                    uuid runner_id FK
                    uuid station_id FK
                    uuid location_id FK
                    timestamp scan_time
                    boolean is_valid
                    string scanned_by "nullable"
                    string note
                    timestamp created_at
                    timestamp updated_at
                }

                ADMIN_USERS {
                    uuid id PK "รหัสผู้ดูแลระบบ"
                    string name "ชื่อผู้มีสิทธิ์"
                    string pin "รหัสส่วนตัว (PIN) 4-6 หลัก"
                }

                STAFF {
                    uuid id PK "รหัสเจ้าหน้าที่/ผู้สแกน"
                    uuid event_id FK "nullable (ผูกเฉพาะงาน หรือใช้ร่วมกัน)"
                    string name "ชื่อเจ้าหน้าที่/Marshal"
                    string role "MARSHAL|TIMING_CREW|ADMIN|VOLUNTEER"
                    string status "ACTIVE|INACTIVE"
                    timestamp created_at
                }

                ACTION_LOGS {
                    uuid id PK "รหัสการบันทึกประวัติ"
                    uuid admin_id FK "อ้างอิงคนที่ทำรายการ"
                    string action_type "เช่น REBUILD_BIB, DELETE_DATA"
                    timestamp created_at "เวลาที่ทำรายการ"
                }

                EVENTS ||--o{ CATEGORIES : "has_categories"
                EVENTS ||--o{ STATIONS : "has_stations"
                EVENTS ||--o{ LOCATIONS : "has_locations"
                EVENTS ||--o{ RUNNERS : "has_registrations"
                EVENTS ||--o{ STAFF : "assigns_staff"
                USERS ||--o{ RUNNERS : "registers_for"
                RUNNERS ||--o{ SCAN_LOGS : "has"
                CATEGORIES ||--|{ RUNNERS : "contains"
                STATIONS ||--o{ SCAN_LOGS : "records"
                LOCATIONS ||--o{ SCAN_LOGS : "happens_at"
                CATEGORIES ||--o{ CHECKPOINT : "defines_route"
                STATIONS ||--o{ CHECKPOINT : "used_in"
                STAFF ||--o{ SCAN_LOGS : "records_by"
                ADMIN_USERS ||--o{ ACTION_LOGS : "performs"`}
          </div>

          <h2>2. Table Structures</h2>
          
          <h3>2.1 EVENTS (งานวิ่ง) <span className="badge">NEW</span></h3>
          <p style={{ fontSize: '14px', color: '#555' }}>ตารางหลักสำหรับจัดการงานวิ่งแต่ละงาน แยกข้อมูลไม่ให้ปะปนกัน</p>
          <table>
              <tbody>
                  <tr><th>Field Name</th><th>Data Type</th><th>Description</th></tr>
                  <tr><td><span className="code">id</span></td><td>UUID (PK)</td><td>รหัสงานวิ่ง</td></tr>
                  <tr><td><span className="code">name</span></td><td>VARCHAR</td><td>ชื่องาน (เช่น &quot;Khao Yai Trail 2026&quot;)</td></tr>
                  <tr><td><span className="code">start_date</span></td><td>DATE</td><td>วันที่เริ่มจัดงาน</td></tr>
                  <tr><td><span className="code">end_date</span></td><td>DATE</td><td>วันสิ้นสุดงาน</td></tr>
                  <tr><td><span className="code">status</span></td><td>ENUM</td><td>สถานะงาน (DRAFT, PUBLISHED, COMPLETED)</td></tr>
              </tbody>
          </table>

          <h3>2.2 USERS (ข้อมูลผู้ใช้งาน/นักวิ่งหลัก) <span className="badge">NEW</span></h3>
          <p style={{ fontSize: '14px', color: '#555' }}>เก็บ Profile หลักของนักวิ่งที่สามารถนำไปใช้สมัครได้หลายๆ งานวิ่งในระบบ</p>
          <table>
              <tbody>
                  <tr><th>Field Name</th><th>Data Type</th><th>Description</th></tr>
                  <tr><td><span className="code">id</span></td><td>UUID (PK)</td><td>รหัสผู้ใช้งานระบบ</td></tr>
                  <tr><td><span className="code">name</span></td><td>VARCHAR</td><td>ชื่อ-นามสกุล</td></tr>
                  <tr><td><span className="code">email</span></td><td>VARCHAR</td><td>อีเมล (ใช้ Login)</td></tr>
                  <tr><td><span className="code">phone</span></td><td>VARCHAR</td><td>เบอร์โทรศัพท์</td></tr>
                  <tr><td><span className="code">gender</span></td><td>VARCHAR</td><td>เพศ</td></tr>
                  <tr><td><span className="code">birth_date</span></td><td>DATE</td><td>วันเกิด (เพื่อคำนวณรุ่นอายุอัตโนมัติ)</td></tr>
                  <tr><td><span className="code">nationality</span></td><td>VARCHAR</td><td>สัญชาติ</td></tr>
              </tbody>
          </table>

          <h3>2.3 RUNNERS (การสมัครแข่งขันของนักวิ่ง) <span className="badge">UPDATED</span></h3>
          <p style={{ fontSize: '14px', color: '#555' }}>ตารางนี้ทำหน้าที่เหมือน <strong>Registrations (การสมัคร)</strong> โดย 1 User สามารถมีได้หลาย Record ถ่าสมัครหลายงาน</p>
          <table>
              <tbody>
                  <tr><th>Field Name</th><th>Data Type</th><th>Description</th></tr>
                  <tr><td><span className="code">id</span></td><td>UUID (PK)</td><td>รหัสการสมัครอ้างอิง (ใช้แทนการอ้างอิงด้วย bib)</td></tr>
                  <tr><td><span className="code">event_id</span></td><td>UUID (FK)</td><td>ระบุว่าสมัครของงานวิ่งไหน (EVENTS.id)</td></tr>
                  <tr><td><span className="code">user_id</span></td><td>UUID (FK)</td><td>ข้อมูลนักวิ่งหลัก (nullable, กรณีสมัครแบบไม่สร้าง Account)</td></tr>
                  <tr><td><span className="code">bib</span></td><td>VARCHAR</td><td>หมายเลขบิบ (nullable, UNIQUE ต่อ event)</td></tr>
                  <tr><td><span className="code">title</span></td><td>VARCHAR</td><td>คำนำหน้าชื่อ</td></tr>
                  <tr><td><span className="code">name</span></td><td>VARCHAR</td><td>ชื่อนักวิ่ง</td></tr>
                  <tr><td><span className="code">gender</span></td><td>VARCHAR</td><td>เพศ</td></tr>
                  <tr><td><span className="code">age</span></td><td>VARCHAR</td><td>อายุ (ตัวเลข - ถ้ามี)</td></tr>
                  <tr><td><span className="code">age_group</span></td><td>VARCHAR</td><td>รุ่นอายุ (ข้อความ)</td></tr>
                  <tr><td><span className="code">cat</span></td><td>VARCHAR</td><td>ข้อมูลระยะทางเดิม (Raw string)</td></tr>
                  <tr><td><span className="code">distance</span></td><td>FLOAT</td><td>ระยะทาง (เช่น 10) ที่สกัดออกมาจากไฟล์</td></tr>
                  <tr><td><span className="code">unit</span></td><td>VARCHAR</td><td>หน่วย (เช่น KM) ที่สกัดออกมาจากไฟล์</td></tr>
                  <tr><td><span className="code">cat_name</span></td><td>VARCHAR</td><td>ชื่อรุ่น (เช่น Hard Rock) ที่สกัดออกมาจากไฟล์</td></tr>
                  <tr><td><span className="code">nat</span></td><td>VARCHAR</td><td>สัญชาติ</td></tr>
                  <tr><td><span className="code">payment_status</span></td><td>VARCHAR</td><td>สถานะการชำระเงิน</td></tr>
                  <tr><td><span className="code">category_id</span></td><td>UUID (FK)</td><td>รหัสระยะทางที่เลือกลง (อ้างอิง CATEGORIES)</td></tr>
                  <tr><td><span className="code">rfid_tag</span></td><td>VARCHAR</td><td>รหัสชิป RFID (nullable, map ตอนเช็คอิน)</td></tr>
                  <tr><td><span className="code">registration_status</span></td><td>ENUM</td><td>PRE_REGISTERED | CHECKED_IN</td></tr>
                  <tr><td><span className="code">checked_in_at</span></td><td>TIMESTAMP</td><td>เวลาที่เช็คอินรับอุปกรณ์ (nullable)</td></tr>
                  <tr><td><span className="code">checked_in_by</span></td><td>VARCHAR</td><td>ผู้ทำการเช็คอินให้ (nullable)</td></tr>
                  <tr><td><span className="code">created_at</span></td><td>TIMESTAMP</td><td>เวลาที่สร้างข้อมูลการสมัคร</td></tr>
                  <tr><td><span className="code">updated_at</span></td><td>TIMESTAMP</td><td>เวลาที่อัปเดตข้อมูลการสมัครล่าสุด</td></tr>
              </tbody>
          </table>

          <h3>2.4 CATEGORIES (ระยะการแข่งขัน) <span className="badge">UPDATED</span></h3>
          <p style={{ fontSize: '14px', color: '#555' }}>ระยะการแข่งขันต่างๆ ภายในงานวิ่งนั้นๆ</p>
          <table>
              <tbody>
                  <tr><th>Field Name</th><th>Data Type</th><th>Description</th></tr>
                  <tr><td><span className="code">id</span></td><td>UUID (PK)</td><td>รหัสระยะวิ่ง</td></tr>
                  <tr><td><span className="code">event_id</span></td><td>UUID (FK)</td><td>อ้างอิงงานวิ่ง (EVENTS.id)</td></tr>
                  <tr><td><span className="code">name</span></td><td>VARCHAR</td><td>ชื่อระยะ (เช่น &quot;MKT10&quot;)</td></tr>
                  <tr><td><span className="code">distance_km</span></td><td>FLOAT</td><td>ระยะทาง (ตัวเลข)</td></tr>
                  <tr><td><span className="code">unit</span></td><td>VARCHAR</td><td>หน่วย (เช่น &quot;km&quot;)</td></tr>
              </tbody>
          </table>

          <h3>2.5 LOCATIONS (สถานที่) <span className="badge">UPDATED</span></h3>
          <p style={{ fontSize: '14px', color: '#555' }}>พิกัดสถานที่สำคัญภายในงานวิ่ง</p>
          <table>
              <tbody>
                  <tr><th>Field Name</th><th>Data Type</th><th>Description</th></tr>
                  <tr><td><span className="code">id</span></td><td>UUID (PK)</td><td>รหัสสถานที่</td></tr>
                  <tr><td><span className="code">event_id</span></td><td>UUID (FK)</td><td>อ้างอิงงานวิ่ง (EVENTS.id)</td></tr>
                  <tr><td><span className="code">name</span></td><td>VARCHAR</td><td>ชื่อสถานที่</td></tr>
                  <tr><td><span className="code">latitude</span></td><td>FLOAT</td><td>ละติจูด</td></tr>
                  <tr><td><span className="code">longitude</span></td><td>FLOAT</td><td>ลองจิจูด</td></tr>
                  <tr><td><span className="code">url</span></td><td>VARCHAR</td><td>ลิงก์แผนที่อ้างอิง</td></tr>
              </tbody>
          </table>

          <h3>2.6 STATIONS (จุดสแกน) <span className="badge">UPDATED</span></h3>
          <p style={{ fontSize: '14px', color: '#555' }}>จุดสแกนเวลาของนักวิ่ง</p>
          <table>
              <tbody>
                  <tr><th>Field Name</th><th>Data Type</th><th>Description</th></tr>
                  <tr><td><span className="code">id</span></td><td>UUID (PK)</td><td>รหัสจุดสแกน</td></tr>
                  <tr><td><span className="code">event_id</span></td><td>UUID (FK)</td><td>อ้างอิงงานวิ่ง (EVENTS.id)</td></tr>
                  <tr><td><span className="code">name</span></td><td>VARCHAR</td><td>ชื่อจุดสแกน (เช่น &quot;CP1&quot;)</td></tr>
                  <tr><td><span className="code">type</span></td><td>ENUM</td><td>ประเภท (START, CP, FINISH)</td></tr>
                  <tr><td><span className="code">sequence_order</span></td><td>INT</td><td>ลำดับของจุดสแกนโดยรวมของงาน</td></tr>
              </tbody>
          </table>

          <h3>2.7 CHECKPOINT (จุดตรวจสอบตามระยะ)</h3>
          <p style={{ fontSize: '14px', color: '#555' }}>เส้นทางและ Cutoff Time ของแต่ละระยะ (Category) ที่ผูกกับ Station</p>
          <table>
              <tbody>
                  <tr><th>Field Name</th><th>Data Type</th><th>Description</th></tr>
                  <tr><td><span className="code">id</span></td><td>UUID (PK)</td><td>รหัสเส้นทางจุดสแกน</td></tr>
                  <tr><td><span className="code">category_id</span></td><td>UUID (FK)</td><td>อ้างอิงระยะวิ่ง (CATEGORIES.id)</td></tr>
                  <tr><td><span className="code">station_id</span></td><td>UUID (FK)</td><td>อ้างอิงจุดสแกน (STATIONS.id)</td></tr>
                  <tr><td><span className="code">sequence_order</span></td><td>INT</td><td>ลำดับของจุดสำหรับระยะนี้</td></tr>
                  <tr><td><span className="code">cutoff_time</span></td><td>TIMESTAMP</td><td>เวลา Cutoff ของจุดนี้ (nullable)</td></tr>
                  <tr><td><span className="code">created_at</span></td><td>TIMESTAMP</td><td>เวลาที่สร้างข้อมูล</td></tr>
                  <tr><td><span className="code">updated_at</span></td><td>TIMESTAMP</td><td>เวลาที่อัปเดตข้อมูลล่าสุด</td></tr>
              </tbody>
          </table>

          <h3>2.8 SCAN_LOGS (ประวัติการสแกนเวลา)</h3>
          <p style={{ fontSize: '14px', color: '#555' }}>ข้อมูลการบันทึกเวลาของนักวิ่งแต่ละคน</p>
          <table>
              <tbody>
                  <tr><th>Field Name</th><th>Data Type</th><th>Description</th></tr>
                  <tr><td><span className="code">id</span></td><td>UUID (PK)</td><td>รหัสการสแกน</td></tr>
                  <tr><td><span className="code">runner_id</span></td><td>UUID (FK)</td><td>อ้างอิงการสมัครนักวิ่ง (RUNNERS.id)</td></tr>
                  <tr><td><span className="code">station_id</span></td><td>UUID (FK)</td><td>อ้างอิงจุดสแกน (STATIONS.id)</td></tr>
                  <tr><td><span className="code">location_id</span></td><td>UUID (FK)</td><td>อ้างอิงสถานที่สแกน (LOCATIONS.id)</td></tr>
                  <tr><td><span className="code">scan_time</span></td><td>TIMESTAMP</td><td>เวลาที่สแกน</td></tr>
                  <tr><td><span className="code">is_valid</span></td><td>BOOLEAN</td><td>สถานะการสแกนว่าถูกต้องหรือไม่</td></tr>
                  <tr><td><span className="code">scanned_by</span></td><td>VARCHAR</td><td>ผู้ทำการสแกนให้ (อ้างอิงชื่อ STAFF หรือกรอกตรง)</td></tr>
                  <tr><td><span className="code">note</span></td><td>VARCHAR</td><td>หมายเหตุเพิ่มเติม</td></tr>
                  <tr><td><span className="code">created_at</span></td><td>TIMESTAMP</td><td>เวลาที่สร้างข้อมูล</td></tr>
                  <tr><td><span className="code">updated_at</span></td><td>TIMESTAMP</td><td>เวลาที่อัปเดตข้อมูลล่าสุด</td></tr>
              </tbody>
          </table>

          <h3>2.9 STAFF (เจ้าหน้าที่ / ผู้สแกนจุดตรวจ) <span className="badge">NEW</span></h3>
          <p style={{ fontSize: '14px', color: '#555' }}>เก็บรายชื่อเจ้าหน้าที่, กรรมการ, Marshal ประจำจุด สำหรับเลือกและบันทึกลงในประวัติการสแกน</p>
          <table>
              <tbody>
                  <tr><th>Field Name</th><th>Data Type</th><th>Description</th></tr>
                  <tr><td><span className="code">id</span></td><td>UUID (PK)</td><td>รหัสเจ้าหน้าที่</td></tr>
                  <tr><td><span className="code">event_id</span></td><td>UUID (FK)</td><td>อ้างอิงงานวิ่ง (nullable - ถ้าใช้งานร่วมกันข้ามงาน)</td></tr>
                  <tr><td><span className="code">name</span></td><td>VARCHAR</td><td>ชื่อเจ้าหน้าที่ / Marshal (เช่น &quot;สมชาย (Marshal 1)&quot;)</td></tr>
                  <tr><td><span className="code">role</span></td><td>VARCHAR</td><td>บทบาท (ADMIN, MARSHAL, CHECKIN_CREW, FINISH_JUDGE)</td></tr>
                  <tr><td><span className="code">status</span></td><td>VARCHAR</td><td>สถานะ (ACTIVE, INACTIVE)</td></tr>
                  <tr><td><span className="code">created_at</span></td><td>TIMESTAMP</td><td>เวลาที่เพิ่มข้อมูล</td></tr>
              </tbody>
          </table>

          <h3>2.10 ADMIN_USERS (ผู้ดูแลระบบ) <span className="badge">NEW</span></h3>
          <p style={{ fontSize: '14px', color: '#555' }}>เก็บข้อมูลผู้ดูแลระบบและรหัส PIN สำหรับยืนยันตัวตนทำรายการสำคัญ (เช่น Rebuild BIB หรือลบข้อมูล)</p>
          <table>
              <tbody>
                  <tr><th>Field Name</th><th>Data Type</th><th>Description</th></tr>
                  <tr><td><span className="code">id</span></td><td>UUID (PK)</td><td>รหัสผู้ดูแลระบบ</td></tr>
                  <tr><td><span className="code">name</span></td><td>VARCHAR</td><td>ชื่อผู้ดูแลระบบ</td></tr>
                  <tr><td><span className="code">pin</span></td><td>VARCHAR</td><td>รหัสส่วนตัว (PIN) 4-6 หลัก</td></tr>
              </tbody>
          </table>

          <h3>2.11 ACTION_LOGS (ประวัติการทำรายการสำคัญ) <span className="badge">NEW</span></h3>
          <p style={{ fontSize: '14px', color: '#555' }}>เก็บประวัติเมื่อมีการทำงานสำคัญๆ เพื่อใช้ตรวจสอบย้อนหลังว่าใครเป็นคนทำรายการ</p>
          <table>
              <tbody>
                  <tr><th>Field Name</th><th>Data Type</th><th>Description</th></tr>
                  <tr><td><span className="code">id</span></td><td>UUID (PK)</td><td>รหัสประวัติ</td></tr>
                  <tr><td><span className="code">admin_id</span></td><td>UUID (FK)</td><td>อ้างอิงผู้ดูแลระบบ (ADMIN_USERS.id)</td></tr>
                  <tr><td><span className="code">action_type</span></td><td>VARCHAR</td><td>ประเภทของรายการ (เช่น REBUILD_BIB, DELETE_DATA)</td></tr>
                  <tr><td><span className="code">created_at</span></td><td>TIMESTAMP</td><td>วันเวลาที่ทำรายการ</td></tr>
              </tbody>
          </table>

          <h2>3. SQL Setup Script สำหรับ Supabase</h2>
          <p style={{ fontSize: '14px', color: '#555' }}>สามารถ Copy คำสั่ง SQL ด้านล่างนี้ไปวางใน <strong>Supabase SQL Editor</strong> เพื่อสร้างตาราง <span className="code">staff</span> และข้อมูลเริ่มต้นได้ทันที:</p>
          <pre style={{ background: '#1e293b', color: '#f8fafc', padding: '16px', borderRadius: '8px', overflowX: 'auto', fontSize: '13px', lineHeight: '1.5' }}>
{`-- สร้างตาราง staff เก็บรายชื่อเจ้าหน้าที่ / คนสแกน
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'MARSHAL',
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- เพิ่มรายชื่อเจ้าหน้าที่เริ่มต้น (Default Staff)
INSERT INTO public.staff (name, role, status) VALUES
('แอดมิน (Admin)', 'ADMIN', 'ACTIVE'),
('เจ้าหน้าที่จุดสตาร์ท (Start Crew)', 'CHECKIN_CREW', 'ACTIVE'),
('Marshal จุด A1', 'MARSHAL', 'ACTIVE'),
('Marshal จุด A2', 'MARSHAL', 'ACTIVE'),
('กรรมการเส้นชัย (Finish Judge)', 'FINISH_JUDGE', 'ACTIVE');`}
          </pre>

          <h2>4. Data Flow (รองรับหลายงานวิ่ง & บันทึกผู้สแกน)</h2>
          <ol>
              <li><strong>การสร้างงานวิ่ง (Event Setup):</strong> Admin สร้าง <span className="code">EVENTS</span> ใหม่ กำหนด <span className="code">CATEGORIES</span>, <span className="code">STATIONS</span>, ผูก <span className="code">CHECKPOINT</span> และกำหนดรายชื่อเจ้าหน้าที่ <span className="code">STAFF</span> ประจำงาน</li>
              <li><strong>การสมัคร (Registration):</strong> นักวิ่ง <span className="code">USERS</span> กดสมัครงานวิ่ง ข้อมูลจะถูกสร้างใน <span className="code">RUNNERS</span> โดยผูกกับ <span className="code">event_id</span> และ <span className="code">category_id</span></li>
              <li><strong>การเลือกตัวตนผู้สแกน (Scanner Operator):</strong> ที่จุดสแกน (Check-in, CP, Finish) เจ้าหน้าที่จะเลือกชื่อตัวเองจาก <span className="code">STAFF</span> (หรือกดเพิ่มชื่อใหม่ได้ทันที)</li>
              <li><strong>การแข่งขัน (Race Day):</strong> เมื่อสแกนบาร์โค้ด ข้อมูลจะบันทึกลงใน <span className="code">SCAN_LOGS</span> พร้อมระบุ <span className="code">scanned_by</span> และ <span className="code">checked_in_by</span> ว่าใครเป็นผู้ทำการสแกน</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
