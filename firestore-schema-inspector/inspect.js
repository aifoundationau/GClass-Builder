const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function describeCollections() {
  try {
    const collections = await db.listCollections();
    const summary = {};

    for (const col of collections) {
      const colName = col.id;
      const snapshot = await col.limit(2).get();

      if (snapshot.empty) {
        summary[colName] = { status: 'empty' };
        continue;
      }

      const fieldsFound = new Set();
      const samples = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        samples.push(data);
        Object.keys(data).forEach(key => fieldsFound.add(key));
      });

      summary[colName] = {
        sampleDocId: snapshot.docs[0].id,
        fields: Array.from(fieldsFound),
        sampleRecord: samples[0]
      };
    }

    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    console.error('Error reading collections:', error);
  }
}

describeCollections();
