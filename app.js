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
const contenedorRec = document.getElementById("contenedor-recordatorios");
const btnAgregarRec = document.getElementById("btn-agregar-rec");

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

// Gestión dinámica de múltiples notificaciones en el formulario
function crearFilaRecordatorio(cantidad = 1, unidad = "60") {
  const div = document.createElement("div");
  div.className = "fila-recordatorio";
  div.innerHTML = `
    <input type="number" class="rec-cantidad" value="${cantidad}" min="0" required>
    <select class="rec-unidad">
      <option value="1" ${unidad === "1" ? "selected" : ""}>Minutos antes</option>
      <option value="60" ${unidad === "60" ? "selected" : ""}>Horas antes</option>
      <option value="1440" ${unidad === "1440" ? "selected" : ""}>Días antes</option>
      <option value="10080" ${unidad === "10080" ? "selected" : ""}>Semanas antes</option>
    </select>
    <button type="button" class="danger btn-quitar-rec" title="Quitar">✕</button>
  `;
  div.querySelector(".btn-quitar-rec").onclick = () => div.remove();
  return div;
}

// Activar botón quitar en la fila inicial
contenedorRec.querySelector(".btn-quitar-rec").onclick = (e) => {
  e.target.closest(".fila-recordatorio").remove();
};

btnAgregarRec.onclick = () => {
  if (contenedorRec.children.length >= 5) {
    return alert("Google Calendar permite un máximo de 5 notificaciones por evento.");
  }
  contenedorRec.appendChild(crearFilaRecordatorio(1, "1440"));
};

// Formatear minutos totales a texto legible (ej. 10080 -> "1 semana antes")
function formatearAnticipacion(minutosTotales) {
  if (minutosTotales === 0) return "Al momento del evento";
  if (minutosTotales % 10080 === 0) {
    const s = minutosTotales / 10080;
    return `${s} ${s === 1 ? "semana" : "semanas"} antes`;
  }
  if (minutosTotales % 1440 === 0) {
    const d = minutosTotales / 1440;
    return `${d} ${d === 1 ? "día" : "días"} antes`;
  }
  if (minutosTotales % 60 === 0) {
    const h = minutosTotales / 60;
    return `${h} ${h === 1 ? "hora" : "horas"} antes`;
  }
  return `${minutosTotales} min antes`;
}

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

  // Recopilar y convertir todas las notificaciones a minutos
  const filas = contenedorRec.querySelectorAll(".fila-recordatorio");
  const listaMinutos = [];
  const overridesGoogle = [];

  for (const fila of filas) {
    const cantidad = parseInt(fila.querySelector(".rec-cantidad").value, 10) || 0;
    const multiplicador = parseInt(fila.querySelector(".rec-unidad").value, 10);
    const totalMinutos = cantidad * multiplicador;

    // Límite oficial de Google Calendar API: 40320 minutos (4 semanas)
    if (totalMinutos > 40320) {
      btnGuardar.disabled = false;
      btnGuardar.textContent = "Guardar en Web y Google Calendar";
      return alert("Google Calendar permite avisos de máximo 4 semanas (28 días) de anticipación.");
    }

    if (!listaMinutos.includes(totalMinutos)) {
      listaMinutos.push(totalMinutos);
      overridesGoogle.push({ method: "popup", minutes: totalMinutos });
    }
  }

  const inicioISO = new Date(inicioLocal).toISOString();
  const finISO = new Date(finLocal).toISOString();

  const eventoGoogle = {
    summary: titulo,
    description: descripcion,
    start: { dateTime: inicioISO, timeZone: "America/Santiago" },
    end: { dateTime: finISO, timeZone: "America/Santiago" },
    reminders: {
      useDefault: overridesGoogle.length === 0,
      overrides: overridesGoogle
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

    // B. Guardar en Firestore
    await addDoc(eventosRef, {
      titulo,
      descripcion,
      inicio: inicioISO,
      fin: finISO,
      recordatorios: listaMinutos,
      googleEventId: dataGoogle.id,
      creadoEn: new Date().toISOString()
    });

    formEvento.reset();
    contenedorRec.innerHTML = "";
    contenedorRec.appendChild(crearFilaRecordatorio(15, "1"));
  } catch (err) {
    console.error(err);
    alert(err.message);
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = "Guardar en Web y Google Calendar";
  }
};

// 4. Leer eventos en tiempo real desde Firestore y permitir eliminar
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

    // Compatibilidad con eventos nuevos (array recordatorios) y anteriores (minutosAlerta)
    const listaAvisos = Array.isArray(ev.recordatorios)
      ? ev.recordatorios.map(formatearAnticipacion).join(" · ")
      : (ev.minutosAlerta !== undefined ? formatearAnticipacion(ev.minutosAlerta) : "Sin aviso");

    const div = document.createElement("div");
    div.className = "evento";
    div.innerHTML = `
      <div>
        <strong>${ev.titulo}</strong><br>
        ${ev.descripcion ? `<span style="font-size:0.85rem; color:#cbd5e1;">${ev.descripcion}</span><br>` : ""}
        <small style="color:#94a3b8;">${fechaFormateada}</small><br>
        <small style="color:#38bdf8;">Avisos: ${listaAvisos}</small>
      </div>
      <button class="danger" type="button">Eliminar</button>
    `;

    div.querySelector("button").onclick = async () => {
      if (!accessToken) return alert("Conecta tu cuenta de Google primero para poder borrarlo también de tu calendario.");
      if (!confirm(`¿Eliminar "${ev.titulo}" de la web y de Google Calendar?`)) return;

      try {
        const delResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.googleEventId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (!delResp.ok && delResp.status !== 404 && delResp.status !== 410) {
          throw new Error("No se pudo eliminar de Google Calendar. Renueva tu sesión e inténtalo de nuevo.");
        }

        await deleteDoc(doc(db, "agenda_eventos", docId));
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    };

    listaEventos.appendChild(div);
  });
});
