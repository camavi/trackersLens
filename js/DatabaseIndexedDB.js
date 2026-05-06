class DatabaseIndexedDB {
  db;
  DB_NAME = "TrackersLens";
  DB_WIDGETS = 'tl_widgets';

  constructor(config) {
    this.DB_NAME = config.dbName || this.DB_NAME;
    this.startTables = config.startTables;
    this.mount();
  }

  async mount() {
    await this.openDatabase();
    if (this.startTables) {
      for (const table of this.startTables) {
        console.log('Creazione tabella: ', table.name);
        await this.createTables(table.name, table.columns);
        //await this.sleep(500);
        console.log('end tabella: ', table.name);
      }
    }
  }

  async getVersion() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME);

      request.onsuccess = (event) => {
        const db = event.target.result;
        const version = db.version;
        db.close(); // Chiudiamo il database dopo aver ottenuto la versione
        resolve(version);
      };

      request.onerror = (event) => {
        console.error("Errore nell'apertura del database:", event.target.errorCode);
        reject(event.target.errorCode);
      };
    });
  }

  async openDatabase() {
    return new Promise(async (resolve, reject) => {
      const v = await this.getVersion();
      const request = indexedDB.open(this.DB_NAME, v);
      request.onupgradeneeded = (event) => {
        this.db = event.target.result;
        console.log("Database creato o aggiornato.");
        resolve(this.db);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log("Database aperto con successo");
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error("Errore nell'apertura del database:", event);
        reject(event.target.errorCode);
      };
    });
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async createTables(table, columns) {
    return new Promise(async (resolve, reject) => {
      if (this.db) {
        this.db.close();
      }
      // Riapre il database con una versione aggiornata per creare un nuovo store
      const v = await this.getVersion();
      const request = indexedDB.open(this.DB_NAME, v + 1);
      request.onupgradeneeded = async (event) => {
        const db = event.target.result;
        // Controlla se l'object store esiste già, se no, lo crea
        if (!db.objectStoreNames.contains(table)) {
          const objectStore = db.createObjectStore(table, { keyPath: "id" });

          // Crea gli indici basati sulle colonne fornite
          console.log(`Object store "${table}" inizio a creazione`);
          columns.forEach((column) => {
            objectStore.createIndex(
              column.name,
              column?.keyPath ?? column.name,
              column?.options ?? { unique: false }
            );
          });

          console.log(`Object store "${table}" creato con successo`);
        } else {
          console.log(`Object store "${table}" esiste già`);
        }
      };

      request.onsuccess = (event) => {
        // Aggiorna la variabile db con la nuova versione del database
        this.db = event.target.result;
        console.log("Database aggiornato con il nuovo object store. " + table);
        resolve();
      };

      request.onerror = (event) => {
        console.error("Errore nella creazione dell'object store:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  async addData(table, data) {
    return new Promise(async (resolve, reject) => {
      const objectStore = await this.objectStore(table, "readwrite");
      const request = objectStore.add(data);

      request.onsuccess = () => {
        console.log("Dato aggiunto con successo:", data);
        resolve(data); // Risolvi la Promise con il dato aggiunto
      };

      request.onerror = (event) => {
        console.error("Errore nell'aggiunta del dato:", event.target.errorCode);
        reject(event.target.errorCode); // Rifiuta la Promise in caso di errore
      };
    });
  }
  async search(table, column, value) {
    return new Promise(async (resolve, reject) => {
      const objectStore = await this.objectStore(table, "readonly");
      const index = objectStore.index(column);
      const request = index.getAll(value);

      request.onsuccess = (event) => {
        console.log("Risultati trovati:", event.target.result);
        resolve(event.target.result); // Risolve con i risultati trovati
      };

      request.onerror = (event) => {
        console.error("Errore nella ricerca:", event.target.errorCode);
        reject([]); // Rifiuta con un array vuoto in caso di errore
      };
    });
  }
  async getAllData(table) {
    return new Promise(async (resolve, reject) => {
      const objectStore = await this.objectStore(table, "readonly");
      const request = objectStore.getAll();

      request.onsuccess = (event) => {
        console.log("Risultati trovati:", event.target.result);
        resolve(Array.from(event.target.result)); // Risolve con i risultati trovati
      };

      request.onerror = (event) => {
        console.error("Errore nella ricerca:", event.target.errorCode);
        reject([]); // Rifiuta con un array vuoto in caso di errore
      };
    });
  }


  async getData(table, id) {
    return new Promise(async (resolve, reject) => {
      const objectStore = await this.objectStore(table, "readonly");
      const request = objectStore.get(id);

      request.onsuccess = (event) => {
        console.log("Dato recuperato:", event.target.result);
        resolve(event.target.result); // Risolvi la Promise con il dato recuperato
      };

      request.onerror = (event) => {
        console.error("Errore nel recupero del dato:", event.target.errorCode);
        reject(event.target.errorCode); // Rifiuta la Promise in caso di errore
      };
    });
  }

  async updateData(table, data) {
    return new Promise(async (resolve, reject) => {
      const objectStore = await this.objectStore(table, "readwrite");
      const request = objectStore.put(data);

      request.onsuccess = () => {
        console.log("Dato aggiornato con successo:", data);
        resolve(data); // Risolve la Promise con il dato aggiornato
      };

      request.onerror = (event) => {
        console.error("Errore nell'aggiornamento del dato:", event.target.errorCode);
        reject(event.target.errorCode); // Rifiuta la Promise in caso di errore
      };
    });
  }

  async deleteData(table, id) {
    return new Promise(async (resolve, reject) => {
      const objectStore = await this.objectStore(table, "readwrite");
      const request = objectStore.delete(id);

      request.onsuccess = () => {
        console.log("Dato cancellato con successo, id:", id);
        resolve(id); // Risolve la Promise con l'id cancellato
      };

      request.onerror = (event) => {
        console.error("Errore nella cancellazione del dato:", event.target.errorCode);
        reject(event.target.errorCode); // Rifiuta la Promise in caso di errore
      };
    });
  }
  async tableExists(tableName) {


    // Verifica se l'object store esiste
    return this.db.objectStoreNames.contains(tableName);
  }

  async objectStore(table, mode = "readwrite") {
    // Assicurati che il database sia aperto
    if (!this.db) {
      await this.openDatabase(); // Se `openDatabase` è già asincrona
    }

    const transaction = this.db.transaction([table], mode);
    return transaction.objectStore(table);
  }
}