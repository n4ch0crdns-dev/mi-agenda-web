import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// 1. Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDRFoo-VRQZ6c6kBNrvhTivH5RFAW6wBhg",
  authDomain: "agenda-318b2.firebaseapp.com",
  projectId: "agenda-318b2",
  storageBucket: "agenda-318b2.firebasestorage.app",
  messagingSenderId: "323003418610",
  appId: "1:323003418610:web:4e7cdcb381c48663e60d6b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const eventosRef = collection(db, "agenda_eventos");

// 2. Configuración de Google OAuth
const CLIENT_ID = "323003418610-kr36vhmj09e7pfp5g8j0bih6p65g6u0q.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar.events";

let tokenClient;
let accessToken = null;

const btnAuth = document.getElementById("btn-auth");
const estadoAuth = document.getElementById("estado-auth");
const formEvento = document.getElementById("form-evento");
const listaEventos = document.getElementById("lista-eventos");

// Inicializar cliente de Google Identity Services
window.onload = () => {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (tokenResponse) => {
      if (tokenResponse.error) {
        console.error("Error OAuth:", tokenResponse);
        alert("Error al conectar con Google: " + tokenResponse.error);
        return;
      }
      accessToken = tokenResponse.access_token;
      estadoAuth.textContent = "Conectado a Google Calendar";
      estadoAuth.style.color = "#4ade80";
      btnAuth.textContent = "Renovar sesión de Google";
      formEvento.classList.remove("hidden");
    },
  });
};

btnAuth.onclick = () => {
  tokenClient.requestAccessToken({ prompt: "consent" });
};

// 3. Crear evento en Google Calendar y Firestore
formEvento.onsubmit = async (e) => {
  e.preventDefault();
  if (!accessToken) return alert("Primero conecta tu cuenta de Google.");

  const btnGuardar = document.getElementById("btn-guardar");
  btnGuardar.disabled = true;
  btnGuardar.textContent = "Sincronizando...";

  const titulo = document.getElementById("titulo").value;
  const descripcion = document.getElementById("descripcion").value;
  const inicioLocal = document.getElementById("inicio").value;
  const finLocal = document.getElementById("fin").value;
  const minutosAlerta = parseInt(document.getElementById("recordatorio").value, 10) || 15;

  const inicioISO = new Date(inicioLocal).toISOString();
  const finISO = new Date(finLocal).toISOString();

  const eventoGoogle = {
    summary: titulo,
    description: descripcion,
    start: { dateTime: inicioISO, timeZone: "America/Santiago" },
    end: { dateTime: finISO, timeZone: "America/Santiago" },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: minutosAlerta }
      ]
    }
  };

  try {
    // A. Enviar a Google Calendar API
    const resp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(eventoGoogle)
    });

    if (!resp.ok) {
      throw new Error("Error al crear en Google Calendar. Si pasó más de 1 hora, presiona 'Renovar sesión de Google'.");
    }
    const dataGoogle = await resp.json();

    // B. Guardar en Firestore incluyendo el ID de Google (dataGoogle.id)
    await addDoc(eventosRef, {
      titulo,
      descripcion,
      inicio: inicioISO,
      fin: finISO,
      minutosAlerta,
      googleEventId: dataGoogle.id,
      creadoEn: new Date().toISOString()
    });

    formEvento.reset();
    document.getElementById("recordatorio").value = "15";
  } catch (err) {
    console.error(err);
    alert(err.message);
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar en Web y Google Calendar";
  }
};

// 4. Leer eventos en tiempo real desde Firestore y permitir eliminar en ambos lados
const q = query(eventosRef, orderBy("inicio", "asc"));

onSnapshot(q, (snapshot) => {
  listaEventos.innerHTML = "";
  if (snapshot.empty) {
    listaEventos.innerHTML = "<p style='color:#94a3b8;'>No hay eventos registrados.</p>";
    return;
  }

  snapshot.forEach((docSnap) => {
    const ev = docSnap.data();
    const docId = docSnap.id;
    const fechaFormateada = new Date(ev.inicio).toLocaleString("es-CL", {
      dateStyle: "medium", timeStyle: "short"
    });

    const div = document.createElement("div");
    div.className = "evento";
    div.innerHTML = `
      <div>
        <strong>${ev.titulo}</strong><br>
        ${ev.descripcion ? `<span style="font-size:0.85rem; color:#cbd5e1;">${ev.descripcion}</span><br>` : ""}
        <small style="color:#94a3b8;">${fechaFormateada} (Aviso: ${ev.minutosAlerta} min antes)</small>
      </div>
      <button class="danger" type="button">Eliminar</button>
    `;

    div.querySelector("button").onclick = async () => {
      if (!accessToken) return alert("Conecta tu cuenta de Google primero para poder borrarlo también de tu calendario.");
      if (!confirm(`¿Eliminar "${ev.titulo}" de la web y de Google Calendar?`)) return;

      try {
        // A. Eliminar en Google Calendar
        const delResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.googleEventId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${accessToken}` }
        });

        // 204 = borrado exitoso, 404/410 = ya estaba borrado en Google Calendar
        if (!delResp.ok && delResp.status !== 404 && delResp.status !== 410) {
          throw new Error("No se pudo eliminar de Google Calendar. Renueva tu sesión e inténtalo de nuevo.");
        }

        // B. Eliminar en Firestore
        await deleteDoc(doc(db, "agenda_eventos", docId));
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    };

    listaEventos.appendChild(div);
  });
});
