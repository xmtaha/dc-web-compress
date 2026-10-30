# Discord Video Compressor

Videoları **tamamen tarayıcı içinde, yerel olarak** Discord için sıkıştıran statik web sitesi. Dosyalar hiçbir sunucuya gönderilmez — videonuz cihazınızdan çıkmaz.

## Özellikler

- **Yerel sıkıştırma**: FFmpeg.wasm ile, yükleme yok.
- **Hedef boyut**: Varsayılan 19 MB; serbestçe değiştirilebilir (10 / 19 / 25 MB hızlı seçenekleri dahil).
- **Akıllı bitrate**: Video süresine göre bitrate hesaplanır; hedefe ulaşmak için gerekirse çözünürlük düşürülür ve çıktı kontrol edilip en fazla bir kez yeniden sıkıştırılır.
- **MP4 (H.264 + AAC)** çıktısı, `+faststart` ile (anında oynatma).
- **İlerleme çubuğu, iptal butonu**, orijinal/sıkıştırılmış boyut karşılaştırması ve indirme butonu.
- Mobil uyumlu, koyu temalı, sade arayüz.

## Çalıştırma

Herhangi bir statik sunucu yeter:

```bash
# Python ile
python -m http.server 8080

# veya Node ile
npx serve .
```

Sonra `http://localhost:8080` açın. *(Sıkı modda dosya API'leri bazen `file://` altında engellenir; mutlaka http üzerinden çalıştırın.)*

