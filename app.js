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

// Catálogo de categorías con colorId oficial de Google Calendar
const CATEGORIAS = {
  personal:    { nombre: "Personal",               colorId: "7",  hex: "#06b6d4" },
  universidad: { nombre: "Universidad",            colorId: "9",  hex: "#3b82f6" },
  cumpleanos:  { nombre: "Cumpleaños / Aniv.",     colorId: "3",  hex: "#a855f7" },
  tramites:    { nombre: "Trámites / Pagos",       colorId: "5",  hex: "#eab308" },
  salud:       { nombre: "Entrenamiento / Salud",  colorId: "10", hex: "#22c55e" },
  urgente:     { nombre: "Urgente",                colorId: "11", hex: "#ef4444" }
};

// 2. Configuración de Google OAuth
const CLIENT_ID = "323003418610-kr36vhmj09e7pfp5g8j0bih6p65g6u0q.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

let tokenClient;
let accessToken = null;
let eventoEnEdicion = null;
let eventosCache = [];
let filtroActual = "todos";
let textoBusqueda = "";
let fullCalendarInstance = null;

// Referencias DOM
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
const selectCategoria = document.getElementById("categoria");
const checkTodoElDia = document.getElementById("todo-el-dia");
const checkRepetirAnual = document.getElementById("repetir-anual");
const buscadorEventos = document.getElementById("buscador-eventos");
const btnLimpiarPasados = document.getElementById("btn-limpiar-pasados");

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

// 3. Helpers de fechas, categorías y cuenta regresiva
function obtenerCategoriaEvento(ev) {
  if (ev.categoria && CATEGORIAS[ev.categoria]) return { key: ev.categoria, ...CATEGORIAS[ev.categoria] };
  if (ev.repetirAnual || (ev.descripcion && ev.descripcion.toLowerCase().includes("cumple"))) {
    return { key: "cumpleanos", ...CATEGORIAS.cumpleanos };
  }
  return { key: "personal", ...CATEGORIAS.personal };
}

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

function isoALocalInput(isoStr) {
  const fecha = new Date(isoStr);
  const offset = fecha.getTimezoneOffset() * 60000;
  return new Date(fecha - offset).toISOString().slice(0, 16);
}

// Calcula la próxima ocurrencia (si es anual, proyecta al año actual o siguiente)
function obtenerOcurrenciaRelevante(ev) {
  const ahora = new Date();
  let inicioDate = ev.todoElDia ? new Date(`${ev.inicio.slice(0, 10)}T00:00:00`) : new Date(ev.inicio);
  let finDate = ev.todoElDia ? new Date(`${ev.fin.slice(0, 10)}T23:59:59`) : new Date(ev.fin);

  if (ev.repetirAnual) {
    const duracionMs = finDate - inicioDate;
    inicioDate.setFullYear(ahora.getFullYear());
    finDate = new Date(inicioDate.getTime() + duracionMs);
    if (finDate < ahora) {
      inicioDate.setFullYear(ahora.getFullYear() + 1);
      finDate = new Date(inicioDate.getTime() + duracionMs);
    }
  }

  return { inicioDate, finDate };
}

// Calcula el texto y estado del contador dinámico en cyan
function calcularCuentaRegresiva(ev) {
  const ahora = new Date();
  const { inicioDate, finDate } = obtenerOcurrenciaRelevante(ev);

  if (!ev.repetirAnual && finDate < ahora) {
    const diasPasados = Math.floor((ahora - finDate) / 86400000);
    const texto = diasPasados === 0 ? "Finalizó hoy" : (diasPasados === 1 ? "Finalizó ayer" : `Finalizó hace ${diasPasados} días`);
    return { texto, esPasado: true, esInminente: false, sortTime: finDate.getTime() };
  }

  if (ahora >= inicioDate && ahora <= finDate) {
    return { texto: "En curso hoy", esPasado: false, esInminente: true, sortTime: inicioDate.getTime() };
  }

  const hoyCero = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const inicioCero = new Date(inicioDate.getFullYear(), inicioDate.getMonth(), inicioDate.getDate());
  const diffDias = Math.round((inicioCero - hoyCero) / 86400000);

  if (diffDias === 0) {
    const diffHoras = Math.max(1, Math.round((inicioDate - ahora) / 3600000));
    return { texto: `Hoy · en ${diffHoras} ${diffHoras === 1 ? "hora" : "horas"}`, esPasado: false, esInminente: true, sortTime: inicioDate.getTime() };
  }
  if (diffDias === 1) {
    return { texto: "Mañana", esPasado: false, esInminente: true, sortTime: inicioDate.getTime() };
  }
  if (diffDias <= 7) {
    return { texto: `Faltan ${diffDias} días`, esPasado: false, esInminente: true, sortTime: inicioDate.getTime() };
  }
  return { texto: `Faltan ${diffDias} días`, esPasado: false, esInminente: false, sortTime: inicioDate.getTime() };
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

// 5. Cargar evento en el formulario (para Editar o Duplicar)
function cargarEventoEnFormulario(docId, ev, esEdicion = true) {
  if (!accessToken) {
    return alert("Conecta tu cuenta de Google primero para poder gestionar eventos.");
  }

  if (esEdicion) {
    eventoEnEdicion = { docId, googleEventId: ev.googleEventId };
    tituloFormulario.textContent = "Editando Evento";
    btnGuardar.textContent = "Actualizar en Web y Google Calendar";
    btnCancelarEdicion.classList.remove("hidden");
  } else {
    eventoEnEdicion = null;
    tituloFormulario.textContent = "Duplicando Evento (Nuevo)";
    btnGuardar.textContent = "Guardar Copia en Web y Google Calendar";
    btnCancelarEdicion.classList.remove("hidden");
  }

  const cat = obtenerCategoriaEvento(ev);
  document.getElementById("titulo").value = ev.titulo || "";
  document.getElementById("descripcion").value = ev.descripcion || "";
  selectCategoria.value = cat.key;
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
  if (!esEdicion) document.getElementById("titulo").focus();
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
  const categoriaKey = selectCategoria.value;
  const catInfo = CATEGORIAS[categoriaKey] || CATEGORIAS.personal;
  const inicioVal = inputInicio.value;
  const finVal = inputFin.value;
  const esTodoElDia = checkTodoElDia.checked;
  const esAnual = checkRepetirAnual.checked;

  if (!titulo) return alert("El título del evento no puede estar vacío.");

  if (esTodoElDia) {
    if (finVal < inicioVal) return alert("La fecha de Fin no puede ser anterior a la fecha de Inicio.");
  } else {
    if (new Date(finVal) <= new Date(inicioVal)) return alert("La fecha y hora de Fin debe ser posterior a la de Inicio.");
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

  const eventoGoogle = {
    summary: titulo,
    description: descripcion,
    colorId: catInfo.colorId,
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
      categoria: categoriaKey,
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

// 7. Renderizado de Lista con Filtros, Búsqueda y Contador Dinámico en Cyan
function renderizarListaEventos() {
  listaEventos.innerHTML = "";

  // Enriquecer cada evento con cuenta regresiva y ordenarlos por proximidad real
  const procesados = eventosCache.map((item) => {
    const countdown = calcularCuentaRegresiva(item.data);
    return { ...item, countdown };
  }).sort((a, b) => a.countdown.sortTime - b.countdown.sortTime);

  const cantidadPasados = procesados.filter((e) => e.countdown.esPasado).length;
  btnLimpiarPasados.classList.toggle("hidden", cantidadPasados === 0);
  if (cantidadPasados > 0) {
    btnLimpiarPasados.textContent = `Limpiar pasados (${cantidadPasados})`;
  }

  const filtrados = procesados.filter(({ data: ev, countdown }) => {
    if (filtroActual === "proximos" && countdown.esPasado) return false;
    if (filtroActual === "anuales" && !ev.repetirAnual) return false;
    if (filtroActual === "pasados" && !countdown.esPasado) return false;

    if (textoBusqueda) {
      const q = textoBusqueda.toLowerCase();
      const coincideTitulo = (ev.titulo || "").toLowerCase().includes(q);
      const coincideDesc = (ev.descripcion || "").toLowerCase().includes(q);
      if (!coincideTitulo && !coincideDesc) return false;
    }
    return true;
  });

  if (filtrados.length === 0) {
    listaEventos.innerHTML = "<p style='color:#94a3b8; font-size:0.9rem;'>No hay eventos que coincidan con este filtro.</p>";
    return;
  }

  filtrados.forEach(({ id: docId, data: ev, countdown }) => {
    const cat = obtenerCategoriaEvento(ev);

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
    const claseCountdown = countdown.esPasado ? "pasado" : (countdown.esInminente ? "inminente" : "");

    const div = document.createElement("div");
    div.className = `evento ${countdown.esPasado ? "pasado" : ""}`;
    div.style.borderLeftColor = cat.hex;

    div.innerHTML = `
      <div class="evento-info">
        <div style="margin-bottom: 0.25rem;">
          <span class="badge-cat"><span class="punto-cat" style="background:${cat.hex};"></span>${cat.nombre}</span>
          ${badgeTodoElDia}${badgeAnual}
        </div>
        <strong style="font-size:1.02rem;">${ev.titulo}</strong><br>
        ${ev.descripcion ? `<span style="font-size:0.85rem; color:#cbd5e1;">${ev.descripcion}</span><br>` : ""}
        <small style="color:#94a3b8;">${fechaFormateada}</small><br>
        <small style="color:#7dd3fc;">Avisos: ${listaAvisos}</small><br>
        <span class="countdown-pill ${claseCountdown}">${countdown.texto}</span>
      </div>
      <div class="acciones-evento">
        <button class="clone btn-duplicar" type="button" title="Clonar evento">Duplicar</button>
        <button class="edit btn-editar" type="button">Editar</button>
        <button class="danger btn-eliminar" type="button">Eliminar</button>
      </div>
    `;

    div.querySelector(".btn-duplicar").onclick = () => cargarEventoEnFormulario(docId, ev, false);
    div.querySelector(".btn-editar").onclick = () => cargarEventoEnFormulario(docId, ev, true);

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
}

// Eventos de filtros, búsqueda y limpieza de pasados
buscadorEventos.addEventListener("input", (e) => {
  textoBusqueda = e.target.value.trim();
  renderizarListaEventos();
});

document.querySelectorAll(".filtro-pill").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".filtro-pill").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    filtroActual = btn.dataset.filtro;
    renderizarListaEventos();
  };
});

btnLimpiarPasados.onclick = async () => {
  const pasados = eventosCache.filter((item) => calcularCuentaRegresiva(item.data).esPasado);
  if (pasados.length === 0) return;
  if (!confirm(`¿Limpiar ${pasados.length} evento(s) finalizado(s) de esta lista web? (Se mantendrán en tu historial de Google Calendar)`)) return;

  for (const item of pasados) {
    await deleteDoc(doc(db, "agenda_eventos", item.id));
  }
};

// Actualizar contadores en tiempo real cada minuto
setInterval(() => {
  if (eventosCache.length > 0) renderizarListaEventos();
}, 60000);

// 8. Vista Calendario Mensual Interactivo (FullCalendar)
function construirEventosFullCalendar() {
  const eventosFC = [];
  const anioActual = new Date().getFullYear();

  eventosCache.forEach(({ id: docId, data: ev }) => {
    const cat = obtenerCategoriaEvento(ev);
    const anios = ev.repetirAnual ? [anioActual - 1, anioActual, anioActual + 1] : [null];

    anios.forEach((anioProyectado) => {
      let startStr = ev.inicio;
      let endStr = ev.fin;

      if (anioProyectado !== null) {
        startStr = `${anioProyectado}${ev.inicio.slice(4)}`;
        endStr = `${anioProyectado}${ev.fin.slice(4)}`;
      }

      if (ev.todoElDia) {
        eventosFC.push({
          id: `${docId}_${anioProyectado || "unico"}`,
          title: ev.titulo,
          start: startStr.slice(0, 10),
          end: sumarUnDia(endStr.slice(0, 10)),
          allDay: true,
          backgroundColor: cat.hex,
          borderColor: cat.hex,
          extendedProps: { docId, ev }
        });
      } else {
        eventosFC.push({
          id: `${docId}_${anioProyectado || "unico"}`,
          title: ev.titulo,
          start: startStr,
          end: endStr,
          allDay: false,
          backgroundColor: cat.hex,
          borderColor: cat.hex,
          extendedProps: { docId, ev }
        });
      }
    });
  });

  return eventosFC;
}

function actualizarFullCalendar() {
  const container = document.getElementById("calendario-container");
  if (!container || typeof FullCalendar === "undefined") return;

  if (!fullCalendarInstance) {
    fullCalendarInstance = new FullCalendar.Calendar(container, {
      initialView: "dayGridMonth",
      locale: "es",
      height: "auto",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,listMonth"
      },
      events: construirEventosFullCalendar(),
      dateClick: (info) => {
        if (!accessToken) {
          alert("Conecta tu cuenta de Google arriba para agendar en esta fecha.");
          return;
        }
        resetearFormulario();
        if (checkTodoElDia.checked) {
          inputInicio.value = info.dateStr;
          inputFin.value = info.dateStr;
        } else {
          inputInicio.value = `${info.dateStr}T09:00`;
          inputFin.value = `${info.dateStr}T10:00`;
        }
        inputFin.min = inputInicio.value;
        formEvento.scrollIntoView({ behavior: "smooth" });
        document.getElementById("titulo").focus();
      },
      eventClick: (info) => {
        const { docId, ev } = info.event.extendedProps;
        cargarEventoEnFormulario(docId, ev, true);
      }
    });
    fullCalendarInstance.render();
  } else {
    fullCalendarInstance.removeAllEvents();
    fullCalendarInstance.addEventSource(construirEventosFullCalendar());
  }
}

// Alternar pestañas Lista / Calendario
const btnVistaLista = document.getElementById("btn-vista-lista");
const btnVistaCalendario = document.getElementById("btn-vista-calendario");
const panelLista = document.getElementById("panel-lista");
const panelCalendario = document.getElementById("panel-calendario");

btnVistaLista.onclick = () => {
  btnVistaLista.classList.add("active");
  btnVistaCalendario.classList.remove("active");
  panelLista.classList.remove("hidden");
  panelCalendario.classList.add("hidden");
};

btnVistaCalendario.onclick = () => {
  btnVistaCalendario.classList.add("active");
  btnVistaLista.classList.remove("active");
  panelCalendario.classList.remove("hidden");
  panelLista.classList.add("hidden");
  actualizarFullCalendar();
  setTimeout(() => fullCalendarInstance?.updateSize(), 50);
};

// 9. Suscripción en tiempo real a Firestore
const q = query(eventosRef, orderBy("inicio", "asc"));

onSnapshot(q, (snapshot) => {
  eventosCache = snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
  renderizarListaEventos();
  if (!panelCalendario.classList.contains("hidden")) {
    actualizarFullCalendar();
  }
});
