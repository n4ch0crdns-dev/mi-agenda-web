import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy 
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
let eventoEnEdicion = null; // Guarda { docId, googleEventId } cuando se está editando

const btnAuth = document.getElementById("btn-auth");
const estadoAuth = document.getElementById("estado-auth");
const formEvento = document.getElementById("form-evento");
const tituloFormulario = document.getElementById("titulo-formulario");
const btnGuardar = document.getElementById("btn-guardar");
const btnCancelarEdicion = document.getElementById("btn-cancelar-edicion");
const listaEventos = document.getElementById("lista-eventos");
const contenedorRec = document.getElementById("contenedor-recordatorios");
const btnAgregarRec = document.getElementById("btn-agregar-rec");
const inputInicio = document.getElementById("inicio");
const inputFin = document.getElementById("fin");
const checkTodoElDia = document.getElementById("todo-el-dia");
const checkRepetirAnual = document.getElementById("repetir-anual");

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

// 3. Helpers de fechas y modo "Todo el día"
function actualizarTipoInputsFecha(esTodoElDia) {
  inputInicio.type = esTodoElDia ? "date" : "datetime-local";
  inputFin.type = esTodoElDia ? "date" : "datetime-local";
}

checkTodoElDia.addEventListener("change", () => {
  actualizarTipoInputsFecha(checkTodoElDia.checked);
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

function sumarUnDia(fechaStr) {
  const [anio, mes, dia] = fechaStr.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia + 1));
  return fecha.toISOString().slice(0, 10);
}

// Convertir ISO UTC guardado en Firestore a formato local "YYYY-MM-DDTHH:mm" para input datetime-local
function isoALocalInput(isoStr) {
  const fecha = new Date(isoStr);
  const offset = fecha.getTimezoneOffset() * 60000;
  return new Date(fecha - offset).toISOString().slice(0, 16);
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

// Descomponer minutos totales a { cantidad, unidad } para rellenar el formulario al editar
function descomponerMinutos(minutosTotales) {
  if (minutosTotales > 0 && minutosTotales % 10080 === 0) return { cantidad: minutosTotales / 10080, unidad: "10080" };
  if (minutosTotales > 0 && minutosTotales % 1440 === 0) return { cantidad: minutosTotales / 1440, unidad: "1440" };
  if (minutosTotales > 0 && minutosTotales % 60 === 0) return { cantidad: minutosTotales / 60, unidad: "60" };
  return { cantidad: minutosTotales, unidad: "1" };
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

// 5. Modo Edición: Cargar datos en el formulario y salir de edición
function cargarEventoParaEditar(docId, ev) {
  if (!accessToken) {
    return alert("Conecta tu cuenta de Google primero para poder editar y sincronizar los cambios.");
  }

  eventoEnEdicion = { docId, googleEventId: ev.googleEventId };
  tituloFormulario.textContent = "Editando Evento";
  btnGuardar.textContent = "Actualizar en Web y Google Calendar";
  btnCancelarEdicion.classList.remove("hidden");

  document.getElementById("titulo").value = ev.titulo || "";
  document.getElementById("descripcion").value = ev.descripcion || "";
  checkTodoElDia.checked = Boolean(ev.todoElDia);
  checkRepetirAnual.checked = Boolean(ev.repetirAnual);

  actualizarTipoInputsFecha(Boolean(ev.todoElDia));

  if (ev.todoElDia) {
    inputInicio.value = ev.inicio.slice(0, 10);
    inputFin.value = ev.fin.slice(0, 10);
  } else {
    inputInicio.value = isoALocalInput(ev.inicio);
    inputFin.value = isoALocalInput(ev.fin);
  }
  inputFin.min = inputInicio.value;

  // Cargar recordatorios existentes
  contenedorRec.innerHTML = "";
  const avisos = Array.isArray(ev.recordatorios)
    ? ev.recordatorios
    : (ev.minutosAlerta !== undefined ? [ev.minutosAlerta] : []);

  if (avisos.length === 0) {
    contenedorRec.appendChild(crearFilaRecordatorio(15, "1"));
  } else {
    avisos.forEach((min) => {
      const { cantidad, unidad } = descomponerMinutos(min);
      contenedorRec.appendChild(crearFilaRecordatorio(cantidad, unidad));
    });
  }

  formEvento.scrollIntoView({ behavior: "smooth" });
}

function resetearFormulario() {
  eventoEnEdicion = null;
  formEvento.reset();
  tituloFormulario.textContent = "Nuevo Evento";
  btnGuardar.textContent = "Guardar en Web y Google Calendar";
  btnCancelarEdicion.classList.add("hidden");
  actualizarTipoInputsFecha(false);
  inputFin.removeAttribute("min");
  contenedorRec.innerHTML = "";
  contenedorRec.appendChild(crearFilaRecordatorio(15, "1"));
}

btnCancelarEdicion.onclick = resetearFormulario;

// 6. Guardar o Actualizar evento en Google Calendar y Firestore
formEvento.onsubmit = async (e) => {
  e.preventDefault();
  if (!accessToken) return alert("Primero conecta tu cuenta de Google.");

  const titulo = document.getElementById("titulo").value.trim();
  const descripcion = document.getElementById("descripcion").value.trim();
  const inicioVal = inputInicio.value;
  const finVal = inputFin.value;
  const esTodoElDia = checkTodoElDia.checked;
  const esAnual = checkRepetirAnual.checked;

  if (!titulo) {
    return alert("El título del evento no puede estar vacío.");
  }

  if (esTodoElDia) {
    if (finVal < inicioVal) {
      return alert("La fecha de Fin no puede ser anterior a la fecha de Inicio.");
    }
  } else {
    if (new Date(finVal) <= new Date(inicioVal)) {
      return alert("La fecha y hora de Fin debe ser posterior a la de Inicio.");
    }
  }

  const textoOriginalBoton = btnGuardar.textContent;
  btnGuardar.disabled = true;
  btnGuardar.textContent = "Sincronizando...";

  const filas = contenedorRec.querySelectorAll(".fila-recordatorio");
  const listaMinutos = [];
  const overridesGoogle = [];

  for (const fila of filas) {
    const cantidad = parseInt(fila.querySelector(".rec-cantidad").value, 10) || 0;
    const multiplicador = parseInt(fila.querySelector(".rec-unidad").value, 10);
    const totalMinutos = cantidad * multiplicador;

    if (totalMinutos > 40320) {
      btnGuardar.disabled = false;
      btnGuardar.textContent = textoOriginalBoton;
      return alert("Google Calendar permite avisos de máximo 4 semanas (28 días) de anticipación.");
    }

    if (!listaMinutos.includes(totalMinutos)) {
      listaMinutos.push(totalMinutos);
      overridesGoogle.push({ method: "popup", minutes: totalMinutos });
    }
  }

  let startGoogle, endGoogle, inicioFirestore, finFirestore;

  if (esTodoElDia) {
    startGoogle = { date: inicioVal, dateTime: null };
    endGoogle = { date: sumarUnDia(finVal), dateTime: null };
    inicioFirestore = `${inicioVal}T00:00:00`;
    finFirestore = `${finVal}T23:59:59`;
  } else {
    inicioFirestore = new Date(inicioVal).toISOString();
    finFirestore = new Date(finVal).toISOString();
    startGoogle = { dateTime: inicioFirestore, timeZone: "America/Santiago", date: null };
    endGoogle = { dateTime: finFirestore, timeZone: "America/Santiago", date: null };
  }

  // Google Calendar usa RRULE:FREQ=YEARLY para repetición anual (null lo elimina al editar)
  const eventoGoogle = {
    summary: titulo,
    description: descripcion,
    start: startGoogle,
    end: endGoogle,
    recurrence: esAnual ? ["RRULE:FREQ=YEARLY"] : null,
    reminders: {
      useDefault: overridesGoogle.length === 0,
      overrides: overridesGoogle
    }
  };

  try {
    const esEdicion = Boolean(eventoEnEdicion);
    const url = esEdicion
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventoEnEdicion.googleEventId}`
      : "https://www.googleapis.com/calendar/v3/calendars/primary/events";

    const resp = await fetch(url, {
      method: esEdicion ? "PATCH" : "POST",
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

    const datosFirestore = {
      titulo,
      descripcion,
      todoElDia: esTodoElDia,
      repetirAnual: esAnual,
      inicio: inicioFirestore,
      fin: finFirestore,
      recordatorios: listaMinutos,
      googleEventId: dataGoogle.id
    };

    if (esEdicion) {
      datosFirestore.actualizadoEn = new Date().toISOString();
      await updateDoc(doc(db, "agenda_eventos", eventoEnEdicion.docId), datosFirestore);
    } else {
      datosFirestore.creadoEn = new Date().toISOString();
      await addDoc(eventosRef, datosFirestore);
    }

    resetearFormulario();
  } catch (err) {
    console.error(err);
    alert(err.message);
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = eventoEnEdicion ? "Actualizar en Web y Google Calendar" : "Guardar en Web y Google Calendar";
  }
};

// 7. Leer eventos en tiempo real y renderizar botones Editar / Eliminar
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

    const badgeTodoElDia = ev.todoElDia ? `<span class="badge">Todo el día</span>` : "";
    const badgeAnual = ev.repetirAnual ? `<span class="badge anual">Anual</span>` : "";

    const div = document.createElement("div");
    div.className = "evento";
    div.innerHTML = `
      <div>
        <strong>${ev.titulo}</strong>${badgeTodoElDia}${badgeAnual}<br>
        ${ev.descripcion ? `<span style="font-size:0.85rem; color:#cbd5e1;">${ev.descripcion}</span><br>` : ""}
        <small style="color:#94a3b8;">${fechaFormateada}</small><br>
        <small style="color:#38bdf8;">Avisos: ${listaAvisos}</small>
      </div>
      <div class="acciones-evento">
        <button class="edit btn-editar" type="button">Editar</button>
        <button class="danger btn-eliminar" type="button">Eliminar</button>
      </div>
    `;

    div.querySelector(".btn-editar").onclick = () => cargarEventoParaEditar(docId, ev);

    div.querySelector(".btn-eliminar").onclick = async () => {
      if (!confirm(`¿Eliminar "${ev.titulo}"?`)) return;

      if (!accessToken) {
        if (confirm("No estás conectado a Google Calendar ahora. ¿Quieres eliminarlo solo de esta página web?")) {
          await deleteDoc(doc(db, "agenda_eventos", docId));
          if (eventoEnEdicion?.docId === docId) resetearFormulario();
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
            if (eventoEnEdicion?.docId === docId) resetearFormulario();
          }
          return;
        }

        if (!delResp.ok && delResp.status !== 404 && delResp.status !== 410) {
          throw new Error(`Error HTTP ${delResp.status} al eliminar en Google Calendar.`);
        }

        await deleteDoc(doc(db, "agenda_eventos", docId));
        if (eventoEnEdicion?.docId === docId) resetearFormulario();
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    };

    listaEventos.appendChild(div);
  });
});
