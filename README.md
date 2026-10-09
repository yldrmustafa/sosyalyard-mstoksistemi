# Belediye Sosyal Yardım ve Stok Yönetim Sistemi

Bu proje, belediye personeli ve yöneticiler için tasarlanmış bir sosyal yardım, vatandaş takibi ve depo stok yönetim sistemidir.

## Özellikler

- Vatandaş kayıt ve arama
- T.C. Kimlik Numarası doğrulama
- Puan yükleme ve kullanım takibi
- Personel ve yönetici rolleri
- Ürün ekleme, stok takibi ve satış işlemleri
- Barkod bazlı ürün yönetimi
- Kullanıcı bazlı işlem geçmişi ve audit kayıtları
- Tek sayfalık web arayüzü

## Kullanılan Teknolojiler

- Python
- FastAPI
- SQLAlchemy
- PostgreSQL
- HTML / CSS / JavaScript

## Proje Yapısı

- `main.py` : FastAPI uygulaması ve endpointler
- `database.py` : veritabanı bağlantısı
- `models.py` : SQLAlchemy modelleri
- `schemas.py` : request/response modelleri
- `crud.py` : iş mantığı ve veritabanı işlemleri
- `arayüz/` : web arayüzü dosyaları

## Kurulum

1. Python kurulumunu yapın.
2. Sanal ortam oluşturun:

   ```bash
   python -m venv .venv
   ```
3. Sanal ortamı etkinleştirin:

   Windows:

   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```
4. Gerekli paketleri yükleyin:

   ```bash
   pip install fastapi uvicorn sqlalchemy python-multipart
   ```

## Çalıştırma

1. Backend'i başlatın:

   ```bash
   python main.py
   ```

   veya:

   ```bash
   uvicorn main:app --reload
   ```
2. Tarayıcıdan arayüzü açın:

   ```text
   http://127.0.0.1:8000
   ```

   Not: Arayüz dosyaları `arayüz/` klasöründedir ve uygulama tarafından servis edilir.

## Varsayılan Hesaplar

- Kullanıcı adı: `admin`

  - Şifre: `admin123`
  - Rol: Yönetici
- Kullanıcı adı: `personel`

  - Şifre: `personel123`
  - Rol: Personel

## Veritabanı

- Bu proje varsayılan olarak PostgreSQL kullanır.
- Bağlantı bilgisi `config.py` içinde tanımlıdır.
- Varsayılan bağlantı: `postgresql://postgres@localhost:5432/belediye_sosyal_yardim`

### Hangi tablolarda veri var?

PostgreSQL içinde şu tablolar oluşturulabilir ve veri saklanır:

- `kullanicilar`
- `vatandaslar`
- `urunler`
- `puan_yuklemeleri`
- `satislar`
- `satis_detaylari`


## Notlar

- Uygulama ilk çalıştırmada gerekli tabloları otomatik olarak oluşturur.
- T.C. Kimlik numarası için temel Türkiye Cumhuriyeti validasyon kuralları uygulanmaktadır.
