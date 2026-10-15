# Poke Card Scout

ระบบช่วยเลือกซื้อการ์ดโปเกมอน ทั้งใบดิบและใบเกรด (PSA, BGS Black Label, CGC, TAG, SQC, PCG ฯลฯ) ภาษา EN / JP / TH และภาษาอื่น

**เปิดใช้งาน:** https://kisstk322.github.io/poke-card-scout/

## ทำอะไรได้บ้าง
- **แนะนำ** การ์ดน่าเก็บ กรองตามหมวด ภาษา งบ
- **ค้นหา** การ์ดทุกใบ: EN (~20,000 ใบ ราคา TCGplayer/Cardmarket), JP (ทุกใบ ราคาร้านขาย/รับซื้อในญี่ปุ่น), TH (ทุกใบจากเว็บทางการ พร้อมรูปจริง) + ภาษาอื่นผ่าน TCGdex พร้อมกราฟราคาย้อนหลัง
- **ประเมิน / ใส่รูป** อ่านป้ายกรอบเกรดจากรูป ดึงราคาตลาด + ราคาจากบันทึกของคุณ + PSA Pop แล้วให้คะแนน 0–100 และ **ราคาที่ควรประมูลไม่เกิน**
- **บันทึกราคาขาย** วางข้อความจากกลุ่มประมูล FB ระบบแยกชื่อ/เกรด/ราคา/วันที่ให้ เก็บในเครื่อง ส่งออก CSV/JSON
- **Backtest** ทดสอบว่าคะแนนทำนายราคาได้จริงไหม (IC, ผลตอบแทนกลุ่มบน/ล่าง, น้ำหนักที่ข้อมูลแนะนำ)

## ข้อมูลอัปเดตเองทุกวัน
GitHub Actions (`.github/workflows/data.yml`) รันทุกวัน 02:00 น. (เวลาไทย) แล้ว commit ข้อมูลลง `data/`

| สคริปต์ | ข้อมูล |
|---|---|
| `pipeline/jp_pokecazilla.py` | ราคาขายถูกสุด/รับซื้อสูงสุดของร้านในญี่ปุ่น ทุกใบ |
| `pipeline/en_pokemontcg.py` | ราคา TCGplayer + Cardmarket การ์ดอังกฤษทุกใบ |
| `pipeline/th_official.py` | รายชื่อการ์ดไทยทุกใบจากเว็บทางการ (เติมทีละส่วนทุกวัน) |
| `pipeline/psa_pop.py` | PSA Population ของการ์ดที่ติดตาม (ต้องตั้ง secret `PSA_TOKEN`) |
| `pipeline/backtest.py` | ผล backtest → `data/backtest/report.json` |

### ตั้งค่าเพิ่มเติม (ไม่บังคับ)
- **PSA Pop อัตโนมัติ:** สมัคร token ฟรีที่ https://www.psacard.com/publicapi แล้วเพิ่มเป็น repo secret ชื่อ `PSA_TOKEN` · ใส่เลข cert ของการ์ดที่อยากติดตามใน `pipeline/psa_track.json`
- **PSA ในหน้าเว็บ:** ใส่ token ในแท็บ "วิธีคิด" (เก็บในเบราว์เซอร์คุณเท่านั้น)
- **pokemontcg.io key:** (ไม่บังคับ) secret `POKEMONTCG_API_KEY` ให้ดึงเร็วขึ้น
- รันเองได้ที่แท็บ Actions → "Update market data" → Run workflow

## ปรับโมเดล
ค่าน้ำหนัก/ค่า k ของเจ้าเกรด/รายการแนะนำ อยู่ใน `js/data.js` สูตรอยู่ใน `js/scoring.js`

## หมายเหตุ
- ข้อมูลราคาเป็นของแหล่งต้นทาง (pokecazilla.com, pokemontcg.io, Pokémon Asia, TCGdex) ดึงอย่างสุภาพตาม robots.txt
- เป็นเครื่องมือช่วยตัดสินใจ ไม่ใช่คำแนะนำการลงทุน
