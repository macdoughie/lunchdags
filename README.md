# Lunchdags – Vercel + Firestore

Privat lunchapp för ett fast lunchgäng. Appen hanterar medlemmar, turordning,
restaurangsökning via OpenStreetMap, individuella betyg 1–10, gemensam
topplista och personliga favoriter.

## 1. Skapa Firebase-projektet

1. Skapa ett projekt på https://console.firebase.google.com/.
2. Lägg till en webbapp i projektet.
3. Skapa en Firestore Database.
4. Öppna Authentication → Sign-in method och aktivera Anonymous.
5. Kopiera webbappens Firebase-konfiguration.

## 2. Testa lokalt

Kopiera .env.example till .env.local och fyll i Firebase-värdena.

Kommandon:

    npm install
    npm run dev

Appen visas på http://localhost:3000.

## 3. Publicera Firestore-reglerna

Installera Firebase CLI om det behövs och logga in:

    npm install -g firebase-tools
    firebase login
    firebase use --add
    firebase deploy --only firestore:rules

Reglerna tillåter endast autentiserade Firebase-användare. Appen loggar in
besökare anonymt, så ingen separat inloggningssida behövs.

## 4. Publicera på Vercel

1. Packa upp projektet och lägg det i ett GitHub-repository.
2. Importera repositoryt i Vercel.
3. Lägg in samtliga värden från .env.example under
   Settings → Environment Variables.
4. Klicka Deploy. Vercel känner automatiskt igen Next.js.

## Restaurangsökning

Användaren kan söka från GPS eller skriva ort, stadsdel eller adress.
Restaurangnamn är ett valfritt filter. Sökningen använder kostnadsfria
OpenStreetMap-tjänster och GPS-positionen sparas inte.

## Firestore-data

Appens gemensamma tillstånd sparas i dokumentet lunchGroups/main.
Dokumentet innehåller medlemmar, aktuell tur i ordningen och lunchhistorik med
betyg. Bilderna ligger i appen och sparas inte i Firestore.
