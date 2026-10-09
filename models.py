from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Kullanici(Base):
    __tablename__ = "kullanicilar"

    id = Column(Integer, primary_key=True, index=True)
    kullanici_adi = Column(String, unique=True, index=True, nullable=False)
    sifre = Column(String, nullable=False)
    rol = Column(String, nullable=False)
    ad_soyad = Column(String, nullable=True)
    tc_no = Column(String(11), nullable=True)

class Urun(Base):
    __tablename__ = "urunler"

    id = Column(Integer, primary_key=True, index=True)
    barkod = Column(String, unique=True, index=True, nullable=False)
    urun_adi = Column(String, nullable=False)
    puan_degeri = Column(Integer, nullable=False)
    stok_miktari = Column(Integer, default=0)

    # İlişkiler
    satis_detaylari = relationship("SatisDetay", back_populates="urun")



class Vatandas(Base):
    __tablename__ = "vatandaslar"

    id = Column(Integer, primary_key=True, index=True)
    tc_no = Column(String(11), unique=True, index=True, nullable=False)
    ad_soyad = Column(String, nullable=False)
    kredi_puani = Column(Integer, default=0)
    durum = Column(Boolean, default=True)
    dogum_tarihi = Column(String, nullable=True)
    adres = Column(String, nullable=True)
    
    
    durum_degistiren_kullanici = Column(String, nullable=True)
    durum_degistirme_tarihi = Column(DateTime, nullable=True)

    # İlişkiler
    satislar = relationship("Satis", back_populates="vatandas")
    puan_gecmisi = relationship("PuanYuklemeGecmisi", back_populates="vatandas")

class SistemAyari(Base):
    __tablename__ = "sistem_ayarlari"

    id = Column(Integer, primary_key=True, index=True)
    anahtar = Column(String, unique=True, index=True, nullable=False)
    deger = Column(String, nullable=False)
    aciklama = Column(String, nullable=True)
    guncelleyen_kullanici = Column(String, nullable=True)
    guncelleme_tarihi = Column(DateTime, default=datetime.utcnow)
    

class PuanYuklemeGecmisi(Base):
    __tablename__ = "puan_yuklemeleri"

    id = Column(Integer, primary_key=True, index=True)
    vatandas_tc = Column(String, ForeignKey("vatandaslar.tc_no"), nullable=False)
    yuklenen_puan = Column(Integer, nullable=False)
    yukleme_tarihi = Column(DateTime, default=datetime.utcnow)
    son_kullanma_tarihi = Column(DateTime, nullable=False)
    aktif = Column(Boolean, default=True)
    yukleyen_kullanici = Column(String, nullable=True)

    # İlişki
    vatandas = relationship("Vatandas", back_populates="puan_gecmisi")


class Satis(Base):
    __tablename__ = "satislar"

    id = Column(Integer, primary_key=True, index=True)
    vatandas_id = Column(Integer, ForeignKey("vatandaslar.id"), nullable=False)
    toplam_puan = Column(Integer, nullable=False)
    tarih = Column(DateTime, default=datetime.utcnow)
    satan_kullanici = Column(String, nullable=True)

    # İlişkiler
    vatandas = relationship("Vatandas", back_populates="satislar")
    detaylar = relationship("SatisDetay", back_populates="satis")


class SatisDetay(Base):
    __tablename__ = "satis_detaylari"

    id = Column(Integer, primary_key=True, index=True)
    satis_id = Column(Integer, ForeignKey("satislar.id"), nullable=False)
    urun_id = Column(Integer, ForeignKey("urunler.id"), nullable=False)
    adet = Column(Integer, nullable=False)
    birim_puan = Column(Integer, nullable=False)

    # İlişkiler
    satis = relationship("Satis", back_populates="detaylar")
    urun = relationship("Urun", back_populates="satis_detaylari")
    