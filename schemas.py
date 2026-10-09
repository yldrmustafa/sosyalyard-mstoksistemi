from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class GirisRequest(BaseModel):
    kullanici_adi: str
    sifre: str

class GirisResponse(BaseModel):
    token: str
    kullanici_adi: str
    rol: str
    ad_soyad: str
    tc_no: Optional[str] = None

class KullaniciCreate(BaseModel):
    kullanici_adi: str
    sifre: str
    rol: str
    ad_soyad: str
    tc_no: str

class KullaniciResponse(BaseModel):
    id: int
    kullanici_adi: str
    rol: str
    sifre: str
    ad_soyad: Optional[str] = None
    tc_no: Optional[str] = None

    class Config:
        from_attributes = True

#vatandaş şemaları
class VatandasBase(BaseModel):
    tc_no: str
    ad_soyad: str
    dogum_tarihi: Optional[str] = None
    adres: Optional[str] = None
    kredi_puani: int = 0

class VatandasCreate(VatandasBase):
    pass

class VatandasResponse(VatandasBase):
    id: int
    durum: bool
    durum_degistiren_kullanici: Optional[str] = None
    durum_degistirme_tarihi: Optional[datetime] = None

    class Config:
        from_attributes = True
#ürün şemaları
class UrunBase(BaseModel):
    barkod: str
    urun_adi: str
    puan_degeri: int
    stok_miktari: int

class UrunCreate(UrunBase):
    pass

class UrunResponse(UrunBase):
    id: int

    class Config:
        from_attributes = True
#satış ve işlem şemaları
class SepetItem(BaseModel):
    barkod: str
    adet: int

class SatisYapRequest(BaseModel):
    tc_no: str
    sepet: List[SepetItem]

class IslemDetayResponse(BaseModel):
    urun_id: int
    urun_adi: Optional[str] = None
    barkod: Optional[str] = None
    adet: int
    birim_puan: int

    class Config:
        from_attributes = True

class IslemGecmisiResponse(BaseModel):
    id: int
    toplam_puan: int
    tarih: datetime
    satan_kullanici: Optional[str] = None
    detaylar: List[IslemDetayResponse]

    class Config:
        from_attributes = True

class KrediYukleRequest(BaseModel):
    tc_no: str
    yuklenecek_puan: int
    gecerlilik_tipi: str  # "dakika", "saat", "gun"
    gecerlilik_degeri: int

class PuanYuklemeOut(BaseModel):
    id: int
    vatandas_tc: str
    yuklenen_puan: int
    yukleme_tarihi: datetime
    son_kullanma_tarihi: datetime
    aktif: bool
    yukleyen_kullanici: Optional[str] = None

    class Config:
        from_attributes = True

class AyarGuncelleRequest(BaseModel):
    anahtar: str
    deger: str

class AyarResponse(BaseModel):
    anahtar: str
    deger: str
    aciklama: Optional[str] = None
    guncelleyen_kullanici: Optional[str] = None

    class Config:
        from_attributes = True