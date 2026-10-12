// Verbindung zur Datenbank eurer WG (Firebase-Projekt → Projekteinstellungen → Web-App → Konfiguration).
// Das ist kein Passwort: Diese Werte stehen in jeder Firebase-Web-App öffentlich im Code.
// Geschützt werden die Daten durch die Firestore-Regeln und den WG-Code im Einladungslink.
// Mit firebase: null läuft die App im Demo-Modus und speichert nur auf dem jeweiligen Gerät.
window.WG_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyCHWr1rDSHTWz9-flBY5BNXGnZqq2Bpb8M',
    authDomain: 'wg-app-5886f.firebaseapp.com',
    projectId: 'wg-app-5886f',
    storageBucket: 'wg-app-5886f.firebasestorage.app',
    messagingSenderId: '492111246422',
    appId: '1:492111246422:web:9067133cacce03815177f7',
  },
};
