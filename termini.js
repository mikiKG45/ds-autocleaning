/* =====================================================================
   RADNO VREME – termini koji se nude klijentima.
   Zauzete dane i termine admin menja na stranici admin.html
   (čuvaju se na serveru, ne ovde).
   ===================================================================== */
window.ZAKAZIVANJE = {
  // Broj telefona na koji stiže zahtev preko WhatsApp-a (bez + i razmaka)
  whatsapp: '381631735198',

  // Termini koji se nude svakog radnog dana
  termini: ['08:00', '10:00', '12:00', '14:00', '16:00'],

  // Kraći radni dan subotom (ako subotom radite ceo dan, obrišite ovaj red)
  terminiSubota: ['09:00', '11:00', '13:00'],

  // Neradni dani u nedelji: 0 = nedelja, 1 = ponedeljak, ... 6 = subota
  neradniDani: [0]

  // Klijent može da zakaže do kraja sledećeg meseca
  // (npr. 30. septembra – ceo oktobar, ali ne i novembar).
};
