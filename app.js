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
const SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

let tokenClient;
let accessToken = null;

const btnAuth = document.getElementById("btn-auth");
const estadoAuth = document.getElementById("estado-auth");
const formEvento = document.getElementById("form-evento");
const listaEventos = document.getElementById("lista-eventos");
const contenedorRec = document.getElementById("contenedor-recordatorios");
const btnAgregarRec = document.getElementById("btn-agregar-rec");
const inputInicio = document.getElementById("inicio");
const inputFin = document.getElementById("fin");
const checkTodoElDia = document.getElementById("todo-el-dia");

async function guardarCorreoUsuario(token) {
  if (localStorage.getItem("gcal_user_email")) return;
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.email) localStorage.setItem("gcal_user_email", data.email);
  } catch (e) {
    console.warn("No se pudo guardar el correo hint:", e);
  }
}

function establecerSesionConectada(token, expiresInSeconds = 3500) {
  accessToken = token;
  const expiraEn = Date.now() + (expiresInSeconds - 60) * 1000;
  localStorage.setItem("gcal_token", token);
  localStorage.setItem("gcal_expira", expiraEn.toString());
  guardarCorreoUsuario(token);

  estadoAuth.textContent = "Conectado a Google Calendar";
  estadoAuth.style.color = "#4ade80";
  btnAuth.textContent = "Renovar sesión de Google";
  formEvento.classList.remove("hidden");
}

function verificarSesionGuardada() {
  const tokenGuardado = localStorage.getItem("gcal_token");
  const expiraGuardado = parseInt(localStorage.getItem("gcal_expira") || "0", 10);

  if (tokenGuardado && Date.now() < expiraGuardado) {
    accessToken = tokenGuardado;
    estadoAuth.textContent = "Conectado a Google Calendar";
    estadoAuth.style.color = "#4ade80";
    btnAuth.textContent = "Renovar sesión de Google";
    formEvento.classList.remove("hidden");
    return true;
  }
  return false;
}

verificarSesionGuardada();

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
      establecerSesionConectada(tokenResponse.access_token, tokenResponse.expires_in);
    },
  });
};

btnAuth.onclick = () => {
  const emailGuardado = localStorage.getItem("gcal_user_email");
  if (emailGuardado) {
    tokenClient.requestAccessToken({ prompt: "", hint: emailGuardado });
  } else {
    tokenClient.requestAccessToken({ prompt: "select_account" });
  }
};

// 3. Alternar modo "Todo el día" y autocompletar Fin
checkTodoElDia.addEventListener("change", () => {
  const esTodoElDia = checkTodoElDia.checked;
  inputInicio.type = esTodoElDia ? "date" : "datetime-local";
  inputFin.type = esTodoElDia ? "date" : "datetime-local";
  inputInicio.value = "";
  inputFin.value = "";
  inputFin.removeAttribute("min");
});

inputInicio.addEventListener("change", () => {
  if (!inputInicio.value) return;
  inputFin.min = inputInicio.value;

  if (checkTodoElDia.checked) {
    inputFin.value = inputInicio.value;
  } else {
    const fechaInicio = new Date(inputInicio.value);
    fechaInicio.setHours(fechaInicio.getHours() + 1);
    const offset = fechaInicio.getTimezoneOffset() * 60000;
    inputFin.value = new Date(fechaInicio - offset).toISOString().slice(0, 16);
  }
});

// Helper para sumar 1 día exacto en formato YYYY-MM-DD (requisito exclusivo de Google Calendar para todo el día)
function sumarUnDia(fechaStr) {
  const [anio, mes, dia] = fechaStr.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia + 1));
  return fecha.toISOString().slice(0, 10);
}

// 4. Gestión de notificaciones múltiples
function crearFilaRecordatorio(cantidad = 15, unidad = "1") {
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

contenedorRec.querySelector(".btn-quitar-rec").onclick = (e) => {
  e.target.closest(".fila-recordatorio").remove();
};

btnAgregarRec.onclick = () => {
  if (contenedorRec.children.length >= 5) {
    return alert("Google Calendar permite un máximo de 5 notificaciones por evento.");
  }
  contenedorRec.appendChild(crearFilaRecordatorio(1, "1440"));
};

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

// 5. Crear evento con validaciones completas
formEvento.onsubmit = async (e) => {
  e.preventDefault();
  if (!accessToken) return alert("Primero conecta tu cuenta de Google.");

  const titulo = document.getElementById("titulo").value.trim();
  const descripcion = document.getElementById("descripcion").value.trim();
  const inicioVal = inputInicio.value;
  const finVal = inputFin.value;
  const esTodoElDia = checkTodoElDia.checked;

  if (!titulo) {
    return alert("El título del evento no puede estar vacío.");
  }

  // Validación estricta de fechas
  if (esTodoElDia) {
    if (finVal < inicioVal) {
      return alert("La fecha de Fin no puede ser anterior a la fecha de Inicio.");
    }
  } else {
    if (new Date(finVal) <= new Date(inicioVal)) {
      return alert("La fecha y hora de Fin debe ser posterior a la de Inicio.");
    }
  }

  const btnGuardar = document.getElementById("btn-guardar");
  btnGuardar.disabled = true;
  btnGuardar.textContent = "Sincronizando...";

  // Recopilar y validar notificaciones
  const filas = contenedorRec.querySelectorAll(".fila-recordatorio");
  const listaMinutos = [];
  const overridesGoogle = [];

  for (const fila of filas) {
    const cantidad = parseInt(fila.querySelector(".rec-cantidad").value, 10) || 0;
    const multiplicador = parseInt(fila.querySelector(".rec-unidad").value, 10);
    const totalMinutos = cantidad * multiplicador;

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

  // Construir objeto para Google Calendar según si es todo el día o con hora
  let startGoogle, endGoogle, inicioFirestore, finFirestore;

  if (esTodoElDia) {
    startGoogle = { date: inicioVal };
    endGoogle = { date: sumarUnDia(finVal) }; // En Google Calendar el fin de "todo el día" es exclusivo
    inicioFirestore = `${inicioVal}T00:00:00`;
    finFirestore = `${finVal}T23:59:59`;
  } else {
    inicioFirestore = new Date(inicioVal).toISOString();
    finFirestore = new Date(finVal).toISOString();
    startGoogle = { dateTime: inicioFirestore, timeZone: "America/Santiago" };
    endGoogle = { dateTime: finFirestore, timeZone: "America/Santiago" };
  }

  const eventoGoogle = {
    summary: titulo,
    description: descripcion,
    start: startGoogle,
    end: endGoogle,
    reminders: {
      useDefault: overridesGoogle.length === 0,
      overrides: overridesGoogle
    }
  };

  try {
    const resp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(eventoGoogle)
    });

    if (resp.status === 401) {
      localStorage.removeItem("gcal_token");
      throw new Error("Tu sesión de Google expiró. Presiona 'Renovar sesión de Google' arriba e inténtalo de nuevo.");
    }
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const detalle = errData.error?.message || `Error HTTP ${resp.status}`;
      throw new Error(`Google Calendar rechazó el evento: ${detalle}`);
    }

    const dataGoogle = await resp.json();

    await addDoc(eventosRef, {
      titulo,
      descripcion,
      todoElDia: esTodoElDia,
      inicio: inicioFirestore,
      fin: finFirestore,
      recordatorios: listaMinutos,
      googleEventId: dataGoogle.id,
      creadoEn: new Date().toISOString()
    });

    // Resetear formulario y devolver inputs a modo datetime-local
    formEvento.reset();
    inputInicio.type = "datetime-local";
    inputFin.type = "datetime-local";
    inputFin.removeAttribute("min");
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

// 6. Leer eventos en tiempo real y eliminar con respaldo ante fallos
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

    let fechaFormateada;
    if (ev.todoElDia) {
      const [y, m, d] = ev.inicio.slice(0, 10).split("-");
      fechaFormateada = `${d}-${m}-${y}`;
    } else {
      fechaFormateada = new Date(ev.inicio).toLocaleString("es-CL", {
        dateStyle: "medium", timeStyle: "short"
      });
    }

    const listaAvisos = Array.isArray(ev.recordatorios)
      ? ev.recordatorios.map(formatearAnticipacion).join(" · ")
      : (ev.minutosAlerta !== undefined ? formatearAnticipacion(ev.minutosAlerta) : "Sin aviso");

    const div = document.createElement("div");
    div.className = "evento";
    div.innerHTML = `
      <div>
        <strong>${ev.titulo}</strong>${ev.todoElDia ? `<span class="badge">Todo el día</span>` : ""}<br>
        ${ev.descripcion ? `<span style="font-size:0.85rem; color:#cbd5e1;">${ev.descripcion}</span><br>` : ""}
        <small style="color:#94a3b8;">${fechaFormateada}</small><br>
        <small style="color:#38bdf8;">Avisos: ${listaAvisos}</small>
      </div>
      <button class="danger" type="button">Eliminar</button>
    `;

    div.querySelector("button").onclick = async () => {
      if (!confirm(`¿Eliminar "${ev.titulo}"?`)) return;

      // Si no hay sesión activa, permitir borrar al menos de la web si el usuario quiere
      if (!accessToken) {
        if (confirm("No estás conectado a Google Calendar ahora. ¿Quieres eliminarlo solo de esta página web?")) {
          await deleteDoc(doc(db, "agenda_eventos", docId));
        }
        return;
      }

      try {
        const delResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.googleEventId}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (delResp.status === 401) {
          localStorage.removeItem("gcal_token");
          if (confirm("Tu sesión de Google expiró. ¿Quieres eliminarlo solo de esta página web de todos modos?")) {
            await deleteDoc(doc(db, "agenda_eventos", docId));
          }
          return;
        }

        if (!delResp.ok && delResp.status !== 404 && delResp.status !== 410) {
          throw new Error(`Error HTTP ${delResp.status} al eliminar en Google Calendar.`);
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
