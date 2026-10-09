from sqlalchemy.orm import Session
from fastapi import HTTPException
from datetime import datetime, timedelta
import random
import models, schemas


def get_tum_urunler(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Urun).offset(skip).limit(limit).all()

def get_urun_by_barkod(db: Session, barkod: str):
    return db.query(models.Urun).filter(models.Urun.barkod == barkod).first()

def generate_unique_barkod(db: Session):
    while True:
        now = datetime.utcnow()
        barkod = f"BT{now.strftime('%d%H%M%S')}{random.randint(1000, 9999)}"
        if not get_urun_by_barkod(db, barkod):
            return barkod

def create_urun(db: Session, urun: schemas.UrunCreate):
    barkod = (urun.barkod or '').strip()
    if not barkod:
        barkod = generate_unique_barkod(db)
    elif get_urun_by_barkod(db, barkod):
        raise HTTPException(status_code=400, detail="Bu barkod ile kayıtlı ürün zaten var.")

    urun_data = urun.model_dump()
    urun_data['barkod'] = barkod
    db_urun = models.Urun(**urun_data)
    db.add(db_urun)
    db.commit()
    db.refresh(db_urun)
    return db_urun



def sure_asimi_kontrol_et(db: Session, tc_no: str):
    """vatandaşin süresi dolmuş puanlarini bulur, pasif yapar ve bakiyeden düşer."""
    simdi = datetime.utcnow()
    sure_gecmis_puanlar = db.query(models.PuanYuklemeGecmisi).filter(
        models.PuanYuklemeGecmisi.vatandas_tc == tc_no,
        models.PuanYuklemeGecmisi.aktif == True,
        models.PuanYuklemeGecmisi.son_kullanma_tarihi < simdi
    ).all()
    
    if sure_gecmis_puanlar:
        vatandas = db.query(models.Vatandas).filter(models.Vatandas.tc_no == tc_no).first()
        if vatandas:
            toplam_dusulecek = 0
            for p in sure_gecmis_puanlar:
                p.aktif = False
                toplam_dusulecek += p.yuklenen_puan
            
            # Puanı eksiye düşürmemek için max(0, bakiye) kullanıyoruz
            vatandas.kredi_puani = max(0, vatandas.kredi_puani - toplam_dusulecek)
            db.commit()
            db.refresh(vatandas)

def get_vatandas_by_tc(db: Session, tc_no: str):
    # Vatandaş her sorgulandığında önce puanlarının süresi dolmuş mu diye kontrol et!
    sure_asimi_kontrol_et(db, tc_no)
    return db.query(models.Vatandas).filter(models.Vatandas.tc_no == tc_no).first()

def get_tum_vatandaslar(db: Session, skip: int = 0, limit: int = 100):
    vatandaslar = db.query(models.Vatandas).offset(skip).limit(limit).all()
    # Listeleme yaparken de herkesin süresini kontrol et
    for v in vatandaslar:
        sure_asimi_kontrol_et(db, v.tc_no)
    
    return db.query(models.Vatandas).offset(skip).limit(limit).all()

def create_vatandas(db: Session, vatandas: schemas.VatandasCreate, yukleyen_kullanici: str = None):
    db_vatandas = models.Vatandas(**vatandas.model_dump())
    db.add(db_vatandas)
    db.commit()
    db.refresh(db_vatandas)

    if vatandas.kredi_puani > 0:
        simdi = datetime.utcnow()
        db.add(models.PuanYuklemeGecmisi(
            vatandas_tc=vatandas.tc_no,
            yuklenen_puan=vatandas.kredi_puani,
            yukleme_tarihi=simdi,
            son_kullanma_tarihi=simdi + timedelta(days=30),
            aktif=True,
            yukleyen_kullanici=yukleyen_kullanici
        ))
        db.commit()
    return db_vatandas

def vatandas_arama_filtreli(db: Session, sorgu: str):
    q = db.query(models.Vatandas)
    if sorgu.isdigit():
        if len(sorgu) == 11:
            q = q.filter(models.Vatandas.tc_no == sorgu)
        else:
            q = q.filter(models.Vatandas.id == int(sorgu))
    else:
        q = q.filter(models.Vatandas.ad_soyad.ilike(f"%{sorgu}%"))

    vatandaslar = q.all()

    for v in vatandaslar:
        sure_asimi_kontrol_et(db, v.tc_no)
    return vatandaslar


def create_puan_yukleme(db: Session, data: schemas.KrediYukleRequest, yukleyen_kullanici: str):
    vatandas = get_vatandas_by_tc(db, data.tc_no)
    if not vatandas:
        raise HTTPException(status_code=404, detail="Vatandaş bulunamadı!")
    
    if data.yuklenecek_puan <= 0:
        raise HTTPException(status_code=400, detail="Yüklenecek puan 0'dan büyük olmalıdır.")

    simdi = datetime.utcnow()
    
    
    if data.gecerlilik_tipi == "dakika":
        son_kullanma = simdi + timedelta(minutes=data.gecerlilik_degeri)
    elif data.gecerlilik_tipi == "saat":
        son_kullanma = simdi + timedelta(hours=data.gecerlilik_degeri)
    elif data.gecerlilik_tipi == "gun":
        son_kullanma = simdi + timedelta(days=data.gecerlilik_degeri)
    else:
        son_kullanma = simdi + timedelta(days=30) # Herhangi bir hatada varsayılan 30 gün
    
    # Yeni bakiyeyi ekle
    vatandas.kredi_puani += data.yuklenecek_puan
    
    # Geçmiş tablosuna kaydet
    gecmis_kayit = models.PuanYuklemeGecmisi(
        vatandas_tc=data.tc_no,
        yuklenen_puan=data.yuklenecek_puan,
        yukleme_tarihi=simdi,
        son_kullanma_tarihi=son_kullanma,
        aktif=True,
        yukleyen_kullanici=yukleyen_kullanici
    )
    db.add(gecmis_kayit)
    db.commit()
    db.refresh(vatandas)
    return vatandas

def get_puan_yukleme_gecmisi(db: Session, tc_no: str):
    sure_asimi_kontrol_et(db, tc_no) # Geçmişi getirmeden önce süresi dolanları pasife çek
    return db.query(models.PuanYuklemeGecmisi).filter(
        models.PuanYuklemeGecmisi.vatandas_tc == tc_no
    ).order_by(models.PuanYuklemeGecmisi.yukleme_tarihi.desc()).all()



def satis_yap(db: Session, satis_istegi: schemas.SatisYapRequest, satan_kullanici: str):
    vatandas = get_vatandas_by_tc(db, satis_istegi.tc_no)
    if not vatandas:
        raise HTTPException(status_code=404, detail="Vatandaş bulunamadı")

    # Pasif vatandaş kontrolü
    if not vatandas.durum:
        raise HTTPException(status_code=400, detail="Bu vatandaşın yardım hakkı pasife alınmıştır. Satış yapılamaz.")

    toplam_tutar = 0
    urunler_kontrol = []

    for item in satis_istegi.sepet:
        if item.adet <= 0:
            raise HTTPException(status_code=400, detail="Ürün adedi 0'dan büyük olmalıdır.")
        urun = get_urun_by_barkod(db, item.barkod)
        if not urun:
            raise HTTPException(status_code=404, detail=f"Barkod {item.barkod} bulunamadı.")
        if urun.stok_miktari <= 0:
            raise HTTPException(status_code=400, detail=f"{urun.urun_adi} stokta yok.")
        if urun.stok_miktari < item.adet:
            raise HTTPException(status_code=400, detail=f"{urun.urun_adi} için yetersiz stok.")
        
        toplam_tutar += urun.puan_degeri * item.adet
        urunler_kontrol.append({"urun": urun, "adet": item.adet})


    if vatandas.kredi_puani < toplam_tutar:
        raise HTTPException(status_code=400, detail="Vatandaşın yeterli puanı yok.")

    satis_kaydi = models.Satis(
        vatandas_id=vatandas.id,
        toplam_puan=toplam_tutar,
        satan_kullanici=satan_kullanici
    )
    db.add(satis_kaydi)
    db.commit()
    db.refresh(satis_kaydi)

    vatandas.kredi_puani -= toplam_tutar

    for uk in urunler_kontrol:
        urun = uk["urun"]
        adet = uk["adet"]
        urun.stok_miktari -= adet
        
        detay = models.SatisDetay(
            satis_id=satis_kaydi.id,
            urun_id=urun.id,
            adet=adet,
            birim_puan=urun.puan_degeri
        )
        db.add(detay)

    db.commit()
    return {"mesaj": "Satış tamamlandı", "kalan_puan": vatandas.kredi_puani}

def get_vatandas_gecmis(db: Session, tc_no: str):
    vatandas = get_vatandas_by_tc(db, tc_no)
    if not vatandas:
        raise HTTPException(status_code=404, detail="Vatandaş bulunamadı")
    
    satislar = db.query(models.Satis).filter(
        models.Satis.vatandas_id == vatandas.id
    ).order_by(models.Satis.id.desc()).all()
    
 
    sonuc = []
    for satis in satislar:
        detay_listesi = []
        for detay in satis.detaylar:
            detay_listesi.append({
                "id": detay.id,
                "urun_id": detay.urun_id,
                "urun_adi": detay.urun.urun_adi if detay.urun else "Bilinmeyen Ürün",
                "barkod": detay.urun.barkod if detay.urun else "-",
                "adet": detay.adet,
                "birim_puan": detay.birim_puan
            })
            
        sonuc.append({
            "id": satis.id,
            "vatandas_id": satis.vatandas_id,
            "toplam_puan": satis.toplam_puan,
            "tarih": satis.tarih.isoformat() if satis.tarih else None,
            "satan_kullanici": satis.satan_kullanici,
            "detaylar": detay_listesi
        })
        
    return sonuc


def vatandas_durum_degistir(db: Session, tc_no: str, degistiren_kullanici: str):
    vatandas = db.query(models.Vatandas).filter(models.Vatandas.tc_no == tc_no).first()
    if not vatandas:
        raise HTTPException(status_code=404, detail="Vatandaş bulunamadı!")
    
  
    vatandas.durum = not vatandas.durum
    vatandas.durum_degistiren_kullanici = degistiren_kullanici
    vatandas.durum_degistirme_tarihi = datetime.utcnow()
    
    db.commit()
    db.refresh(vatandas)
    return vatandas

def get_sistem_ayari(db: Session, anahtar: str, varsayilan: str = "50"):
    ayar = db.query(models.SistemAyari).filter(models.SistemAyari.anahtar == anahtar).first()
    if not ayar:
        # İlk seferde yoksa varsayılan değerle oluştur
        ayar = models.SistemAyari(
            anahtar=anahtar,
            deger=str(varsayilan),
            aciklama="Personelin tekil/toplam yükleyebileceği azami yardım puanı limiti."
        )
        db.add(ayar)
        db.commit()
        db.refresh(ayar)
    return ayar.deger

def set_sistem_ayari(db: Session, anahtar: str, deger: str, guncelleyen: str):
    ayar = db.query(models.SistemAyari).filter(models.SistemAyari.anahtar == anahtar).first()
    if not ayar:
        ayar = models.SistemAyari(anahtar=anahtar, deger=deger)
        db.add(ayar)
    ayar.deger = str(deger)
    ayar.guncelleyen_kullanici = guncelleyen
    ayar.guncelleme_tarihi = datetime.utcnow()
    db.commit()
    db.refresh(ayar)
    return ayar

def get_tum_kullanicilar(db: Session):
    return db.query(models.Kullanici).order_by(models.Kullanici.id.asc()).all()