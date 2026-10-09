from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
from typing import List
import secrets
from datetime import datetime
import models, schemas, crud
from database import engine, get_db

#  Veritabanı tablolarını oluştur
models.Base.metadata.create_all(bind=engine)

#  Eksik sütunlar için dinamik migrasyon kontrolü
with engine.begin() as connection:
    existing_puan = {c["name"] for c in inspect(engine).get_columns("puan_yuklemeleri")}
    if "yukleyen_kullanici" not in existing_puan:
        connection.execute(text("ALTER TABLE puan_yuklemeleri ADD COLUMN yukleyen_kullanici VARCHAR"))
        
    existing_satis = {c["name"] for c in inspect(engine).get_columns("satislar")}
    if "satan_kullanici" not in existing_satis:
        connection.execute(text("ALTER TABLE satislar ADD COLUMN satan_kullanici VARCHAR"))
        
    existing_kullanici = {c["name"] for c in inspect(engine).get_columns("kullanicilar")}
    if "ad_soyad" not in existing_kullanici:
        connection.execute(text("ALTER TABLE kullanicilar ADD COLUMN ad_soyad VARCHAR"))
    if "tc_no" not in existing_kullanici:
        connection.execute(text("ALTER TABLE kullanicilar ADD COLUMN tc_no VARCHAR(11)"))
        
    existing_vatandas = {c["name"] for c in inspect(engine).get_columns("vatandaslar")}
    if "durum_degistiren_kullanici" not in existing_vatandas:
        connection.execute(text("ALTER TABLE vatandaslar ADD COLUMN durum_degistiren_kullanici VARCHAR"))
    if "durum_degistirme_tarihi" not in existing_vatandas:
        connection.execute(text("ALTER TABLE vatandaslar ADD COLUMN durum_degistirme_tarihi TIMESTAMP"))


app = FastAPI(
    title="Belediye Sosyal Yardım & Stok Yönetim Sistemi",
    description="Vatandaş puan/kredi, süre takibi ve depo stok otomasyonu API'si",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_methods=["*"],
    allow_headers=["*"],
)

USERS = {
    "admin": {"sifre": "admin123", "rol": "Yönetici", "ad_soyad": "Sistem Yöneticisi", "tc_no": None},
    "personel": {"sifre": "personel123", "rol": "Personel", "ad_soyad": "Sistem Personeli", "tc_no": None},
}
ACTIVE_TOKENS = {}

def validate_turkish_tc(tc: str) -> bool:
    """Resmi Türkiye Cumhuriyeti T.C. Kimlik Numarası Doğrulama Algoritması"""
    if not tc or len(tc) != 11 or not tc.isdigit():
        return False
    if tc[0] == '0':
        return False
    
    digits = [int(d) for d in tc]
    odd_sum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8]
    even_sum = digits[1] + digits[3] + digits[5] + digits[7]
    
    tenth_digit = ((odd_sum * 7) - even_sum) % 10
    if digits[9] != tenth_digit:
        return False
    
    eleventh_digit = sum(digits[:10]) % 10
    if digits[10] != eleventh_digit:
        return False
        
    return True

def get_current_user(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Giriş yapmanız gerekiyor.")
    token = authorization[7:]
    user = ACTIVE_TOKENS.get(token)
    if not user:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş oturum.")
    return user

def require_admin(user=Depends(get_current_user)):
    if user["rol"] != "Yönetici":
        raise HTTPException(status_code=403, detail="Bu işlem yalnızca yönetici tarafından yapılabilir.")
    return user

def require_credit_access(user=Depends(get_current_user)):
    return user

def get_user_role(db: Session, username: str):
    if username in USERS:
        return USERS[username]["rol"]
    user = db.query(models.Kullanici).filter(models.Kullanici.kullanici_adi == username).first()
    return user.rol if user else None



@app.post("/giris", response_model=schemas.GirisResponse, summary="Kullanıcı Girişi")
def giris(data: schemas.GirisRequest, db: Session = Depends(get_db)):
    username = data.kullanici_adi.strip().lower()
    db_user = db.query(models.Kullanici).filter(models.Kullanici.kullanici_adi == username).first()
    user = {"sifre": db_user.sifre, "rol": db_user.rol, "ad_soyad": db_user.ad_soyad, "tc_no": db_user.tc_no} if db_user else USERS.get(username)
    if not user or not secrets.compare_digest(user["sifre"], data.sifre):
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı.")
    token = secrets.token_urlsafe(32)
    ACTIVE_TOKENS[token] = {"kullanici_adi": username, "rol": user["rol"], "ad_soyad": user["ad_soyad"], "tc_no": user["tc_no"]}
    return {"token": token, "kullanici_adi": username, "rol": user["rol"], "ad_soyad": user["ad_soyad"] or username, "tc_no": user["tc_no"]}

@app.post("/kullanicilar", response_model=schemas.KullaniciResponse, summary="Yeni Kullanıcı Ekle")
def kullanici_ekle(data: schemas.KullaniciCreate, db: Session = Depends(get_db), user=Depends(require_admin)):
    username = data.kullanici_adi.strip().lower()
    if not username or not data.sifre or not data.ad_soyad or not data.tc_no:
        raise HTTPException(status_code=400, detail="Kullanıcı adı, şifre, ad soyad ve T.C. zorunludur.")
    if not validate_turkish_tc(data.tc_no):
        raise HTTPException(status_code=400, detail="Geçersiz T.C. Kimlik Numarası.")
    if data.rol not in ("Yönetici", "Personel"):
        raise HTTPException(status_code=400, detail="Rol Yönetici veya Personel olmalıdır.")
    if username in USERS or db.query(models.Kullanici).filter(models.Kullanici.kullanici_adi == username).first():
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kayıtlı.")
    if db.query(models.Kullanici).filter(models.Kullanici.tc_no == data.tc_no).first():
        raise HTTPException(status_code=400, detail="Bu T.C. Kimlik Numarası zaten kayıtlı.")
    new_user = models.Kullanici(kullanici_adi=username, sifre=data.sifre, rol=data.rol, ad_soyad=data.ad_soyad.strip(), tc_no=data.tc_no)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user



@app.post("/vatandaslar/", response_model=schemas.VatandasResponse, summary="Yeni Vatandaş Kaydet")
def vatandas_ekle(vatandas: schemas.VatandasCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not validate_turkish_tc(vatandas.tc_no):
        raise HTTPException(status_code=400, detail="Geçersiz T.C. Kimlik Numarası.")
    db_vatandas = crud.get_vatandas_by_tc(db, tc_no=vatandas.tc_no)
    if db_vatandas:
        raise HTTPException(status_code=400, detail="Bu T.C. Kimlik No ile kayıtlı vatandaş zaten var.")
    return crud.create_vatandas(db=db, vatandas=vatandas, yukleyen_kullanici=user["kullanici_adi"])

@app.get("/vatandaslar/{tc_no}", response_model=schemas.VatandasResponse, summary="T.C. ile Vatandaş Sorgula")
def vatandas_getir(tc_no: str, db: Session = Depends(get_db)):
    if not validate_turkish_tc(tc_no):
        raise HTTPException(status_code=400, detail="Sorgulanan T.C. Kimlik Numarası geçersizdir.")
    vatandas = crud.get_vatandas_by_tc(db, tc_no=tc_no)
    if not vatandas:
        raise HTTPException(status_code=404, detail="Vatandaş bulunamadı!")
    return vatandas

@app.put("/vatandaslar/durum-degistir/{tc_no}", response_model=schemas.VatandasResponse, summary="Vatandaş Durumunu Değiştir (Aktif/Pasif)")
def vatandas_durum_degistir(tc_no: str, db: Session = Depends(get_db), user=Depends(require_admin)):
    if not validate_turkish_tc(tc_no):
        raise HTTPException(status_code=400, detail="Geçersiz T.C. Kimlik Numarası.")
    return crud.vatandas_durum_degistir(db=db, tc_no=tc_no, degistiren_kullanici=user["kullanici_adi"])

@app.get("/vatandaslar/sorgula/{sorgu_metni}", response_model=List[schemas.VatandasResponse], summary="Gelişmiş Vatandaş Arama")
def vatandas_sorgula(sorgu_metni: str, db: Session = Depends(get_db)):
    return crud.vatandas_arama_filtreli(db, sorgu_metni)

@app.get("/vatandaslar/", response_model=List[schemas.VatandasResponse], summary="Tüm Vatandaşları Listele")
def tum_vatandaslari_getir(db: Session = Depends(get_db)):
    return crud.get_tum_vatandaslar(db)



@app.post("/vatandaslar/kredi-yukle", response_model=schemas.VatandasResponse, summary="Vatandaşa Puan / Kredi Yükle")
def kredi_yukle(data: schemas.KrediYukleRequest, db: Session = Depends(get_db), user=Depends(require_credit_access)):
    if not validate_turkish_tc(data.tc_no):
        raise HTTPException(status_code=400, detail="Geçersiz T.C. Kimlik Numarası.")
    
    if user["rol"] == "Personel":
        # 📌 Limiti veritabanından dinamik çekiyoruz:
        personel_limiti = int(crud.get_sistem_ayari(db, "personel_puan_limiti", varsayilan="50"))
        
        personel_yuklemeleri = db.query(models.PuanYuklemeGecmisi).filter(
            models.PuanYuklemeGecmisi.vatandas_tc == data.tc_no,
            models.PuanYuklemeGecmisi.yukleyen_kullanici.isnot(None)
        ).all()
        toplam_personel_puani = sum(
            kayit.yuklenen_puan for kayit in personel_yuklemeleri
            if get_user_role(db, kayit.yukleyen_kullanici) == "Personel"
        )
        if toplam_personel_puani + data.yuklenecek_puan > personel_limiti:
            kalan = max(0, personel_limiti - toplam_personel_puani)
            raise HTTPException(
                status_code=403,
                detail=f"Bu vatandaşa personel tarafından en fazla {personel_limiti} puan yüklenebilir. Kalan limit: {kalan} puan."
            )
            
    vatandas = crud.create_puan_yukleme(db, data, user["kullanici_adi"])
    if not vatandas:
        raise HTTPException(status_code=404, detail="Vatandaş bulunamadı")
    return vatandas

@app.get("/ayarlar/personel-limiti", summary="Mevcut Personel Limitini Getir")
def get_personel_limiti(db: Session = Depends(get_db)):
    limit = crud.get_sistem_ayari(db, "personel_puan_limiti", varsayilan="50")
    return {"personel_puan_limiti": int(limit)}

@app.post("/ayarlar/personel-limiti", summary="Personel Limitini Güncelle (Yalnızca Yönetici)")
def update_personel_limiti(data: schemas.AyarGuncelleRequest, db: Session = Depends(get_db), user=Depends(require_admin)):
    if not data.deger.isdigit() or int(data.deger) < 0:
        raise HTTPException(status_code=400, detail="Limit pozitif bir tam sayı olmalıdır.")
    ayar = crud.set_sistem_ayari(db, "personel_puan_limiti", data.deger, user["kullanici_adi"])
    return {"mesaj": "Personel puan limiti başarıyla güncellendi.", "yeni_limit": int(ayar.deger)}

@app.get("/vatandaslar/puan-gecmisi/{tc_no}", response_model=List[schemas.PuanYuklemeOut], summary="Vatandaşın Puan Yükleme Geçmişini Getir")
def get_puan_gecmisi(tc_no: str, db: Session = Depends(get_db)):
    if not validate_turkish_tc(tc_no):
        raise HTTPException(status_code=400, detail="Geçersiz T.C. Kimlik Numarası.")
    return crud.get_puan_yukleme_gecmisi(db, tc_no)


@app.post("/urunler/", response_model=schemas.UrunResponse, summary="Yeni Ürün Ekle veya Stok Güncelleştir")
def urun_ekle(urun: schemas.UrunCreate, db: Session = Depends(get_db), user=Depends(require_admin)):
    barkod = (urun.barkod or '').strip()
    if not barkod:
        barkod = crud.generate_unique_barkod(db)
    
    db_urun = crud.get_urun_by_barkod(db, barkod=barkod)
    if db_urun:
        db_urun.stok_miktari += urun.stok_miktari
        db.commit()
        db.refresh(db_urun)
        return db_urun
    
    urun_data = urun.model_dump()
    urun_data['barkod'] = barkod
    return crud.create_urun(db=db, urun=schemas.UrunCreate(**urun_data))

@app.get("/urunler/", response_model=List[schemas.UrunResponse], summary="Tüm Ürünleri Listele")
def urunleri_getir(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud.get_tum_urunler(db=db, skip=skip, limit=limit)

@app.get("/urunler/{barkod}", response_model=schemas.UrunResponse, summary="Barkod ile Ürün Sorgula")
def urun_getir_barkod(barkod: str, db: Session = Depends(get_db)):
    urun = db.query(models.Urun).filter(models.Urun.barkod == barkod).first()
    if not urun:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı!")
    return urun



@app.post("/satis/yap", summary="Market Satış İşlemi (Stok ve Puan Düşer)")
def satis_yap(request: schemas.SatisYapRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not validate_turkish_tc(request.tc_no):
        raise HTTPException(status_code=400, detail="Satış yapılacak T.C. Kimlik Numarası geçersizdir.")
    return crud.satis_yap(db=db, satis_istegi=request, satan_kullanici=user["kullanici_adi"])

@app.get("/satis/gecmis/{tc_no}", response_model=List[schemas.IslemGecmisiResponse], summary="Vatandaşın Geçmiş Alışveriş Fişleri")
def vatandas_gecmisi(tc_no: str, db: Session = Depends(get_db)):
    if not validate_turkish_tc(tc_no):
        raise HTTPException(status_code=400, detail="Geçersiz T.C. Kimlik Numarası.")
    return crud.get_vatandas_gecmis(db=db, tc_no=tc_no)


@app.get("/kullanicilar", response_model=List[schemas.KullaniciResponse], summary="Tüm Kullanıcıları Listele (Yalnızca Yönetici)")
def tum_kullanicilari_getir(db: Session = Depends(get_db), user=Depends(require_admin)):
    kullanicilar = crud.get_tum_kullanicilar(db=db)
    
    # Bellekteki varsayılan admin/personel veritabanında yoksa listeye dahil edilir
    db_usernames = {u.kullanici_adi for u in kullanicilar}
    sonuc = list(kullanicilar)
    
    idx = 900
    for k_adi, k_data in USERS.items():
        if k_adi not in db_usernames:
            sonuc.append({
                "id": idx,
                "kullanici_adi": k_adi,
                "sifre": k_data["sifre"],
                "rol": k_data["rol"],
                "ad_soyad": k_data.get("ad_soyad"),
                "tc_no": k_data.get("tc_no")
            })
            idx += 1
            
    return sonuc