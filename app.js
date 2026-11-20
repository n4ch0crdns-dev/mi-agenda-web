import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { 
  getFirestore, collection, addDoc, setDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy 
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
const categoriasRef = collection(db, "agenda_categorias");

// Paleta oficial de 11 colores soportados por la API de Google Calendar
const GOOGLE_COLORES = [
  { colorId: "7",  nombre: "Pavo real (Cyan)",    hex: "#039be5" },
  { colorId: "9",  nombre: "Arándano (Azul)",     hex: "#3f51b5" },
  { colorId: "3",  nombre: "Uva (Morado)",        hex: "#8e24aa" },
  { colorId: "1",  nombre: "Lavanda",             hex: "#7986cb" },
  { colorId: "4",  nombre: "Flamenco (Rosa)",     hex: "#e67c73" },
  { colorId: "11", nombre: "Tomate (Rojo)",       hex: "#d50000" },
  { colorId: "6",  nombre: "Mandarina (Naranja)", hex: "#f4511e" },
  { colorId: "5",  nombre: "Plátano (Amarillo)",  hex: "#f6bf26" },
  { colorId: "2",  nombre: "Salvia (Verde claro)",hex: "#33b679" },
  { colorId: "10", nombre: "Albahaca (Verde)",    hex: "#0b8043" },
  { colorId: "8",  nombre: "Grafito (Gris)",      hex: "#616161" }
];

const CATEGORIAS_INICIALES = [
  { id: "personal",    nombre: "Personal",              colorId: "7",  hex: "#039be5" },
  { id: "universidad", nombre: "Universidad",           colorId: "9",  hex: "#3f51b5" },
  { id: "cumpleanos",  nombre: "Cumpleaños / Aniv.",    colorId: "3",  hex: "#8e24aa" },
  { id: "tramites",    nombre: "Trámites / Pagos",      colorId: "5",  hex: "#f6bf26" },
  { id: "salud",       nombre: "Entrenamiento / Salud", colorId: "10", hex: "#0b8043" },
  { id: "urgente",     nombre: "Urgente",               colorId: "11", hex: "#d50000" }
];

const MAPA_DIAS_JS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const NOMBRES_DIAS = { MO: "Lun", TU: "Mar", WE: "Mié", TH: "Jue", FR: "Vie", SA: "Sáb", SU: "Dom" };

// 2. Configuración de Google OAuth
const CLIENT_ID = "323003418610-kr36vhmj09e7pfp5g8j0bih6p65g6u0q.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

let tokenClient;
let accessToken = null;
let eventoEnEdicion = null;
let categoriaEnEdicionId = null;
let colorSeleccionado = GOOGLE_COLORES[0];
let categoriasCache = [];
let eventosCache = [];
let filtroActual = "todos";
let filtroCategoriaActual = "todas";
let textoBusqueda = "";
let fullCalendarInstance = null;
let semillaCategoriasIntentada = false;

// Referencias DOM
const btnAuth = document.getElementById("btn-auth");
const btnSyncGoogle = document.getElementById("btn-sync-google");
const estadoAuth = document.getElementById("estado-auth");
const formEvento = document.getElementById("form-evento");
const tituloFormulario = document.getElementById("titulo-formulario");
const btnGuardar = document.getElementById("btn-guardar");
const btnCancelarEdicion = document.getElementById("btn-cancelar-edicion");
const listaEventos = document.getElementById("lista-eventos");
const contenedorRec = document.getElementById("contenedor-recordatorios");
const btnAgregarRec = document.getElementById("btn-agregar-rec");
const contenedorSubtareas = document.getElementById("contenedor-subtareas");
const btnAgregarSubtarea = document.getElementById("btn-agregar-subtarea");
const inputInicio = document.getElementById("inicio");
const inputFin = document.getElementById("fin");
const selectCategoria = document.getElementById("categoria");
const selectFiltroCategoria = document.getElementById("filtro-categoria");
const checkTodoElDia = document.getElementById("todo-el-dia");
const selectRepeticion = document.getElementById("repeticion");
const contenedorDiasSemana = document.getElementById("contenedor-dias-semana");
const buscadorEventos = document.getElementById("buscador-eventos");
const btnLimpiarPasados = document.getElementById("btn-limpiar-pasados");

// Referencias DOM Gestor de Categorías
const panelCategorias = document.getElementById("panel-categorias");
const btnToggleCategorias = document.getElementById("btn-toggle-categorias");
const btnCerrarCategorias = document.getElementById("btn-cerrar-categorias");
const tituloFormCat = document.getElementById("titulo-form-cat");
const inputCatNombre = document.getElementById("cat-nombre");
const catColorLabel = document.getElementById("cat-color-label");
const paletaColoresDiv = document.getElementById("paleta-colores");
const btnGuardarCategoria = document.getElementById("btn-guardar-categoria");
const btnCancelarCat = document.getElementById("btn-cancelar-cat");
const listaCategoriasAdmin = document.getElementById("lista-categorias-admin");

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

function activarInterfazConectada() {
  estadoAuth.textContent = "Conectado a Google Calendar";
  estadoAuth.style.color = "#4ade80";
  btnAuth.textContent = "Renovar sesión de Google";
  btnSyncGoogle.classList.remove("hidden");
  formEvento.classList.remove("hidden");
}

function establecerSesionConectada(token, expiresInSeconds = 3500) {
  accessToken = token;
  const expiraEn = Date.now() + (expiresInSeconds - 60) * 1000;
  localStorage.setItem("gcal_token", token);
  localStorage.setItem("gcal_expira", expiraEn.toString());
  guardarCorreoUsuario(token);
  activarInterfazConectada();
}

function verificarSesionGuardada() {
  const tokenGuardado = localStorage.getItem("gcal_token");
  const expiraGuardado = parseInt(localStorage.getItem("gcal_expira") || "0", 10);

  if (tokenGuardado && Date.now() < expiraGuardado) {
    accessToken = tokenGuardado;
    activarInterfazConectada();
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

// =========================================================================
// 3. GESTIÓN DE CATEGORÍAS (CREAR, EDITAR, ELIMINAR)
// =========================================================================

function renderizarPaletaColores() {
  paletaColoresDiv.innerHTML = "";
  GOOGLE_COLORES.forEach((col) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `swatch-color ${col.colorId === colorSeleccionado.colorId ? "selected" : ""}`;
    btn.style.backgroundColor = col.hex;
    btn.title = col.nombre;
    btn.onclick = () => {
      colorSeleccionado = col;
      catColorLabel.textContent = col.nombre;
      renderizarPaletaColores();
    };
    paletaColoresDiv.appendChild(btn);
  });
}

renderizarPaletaColores();

btnToggleCategorias.onclick = () => panelCategorias.classList.toggle("hidden");
btnCerrarCategorias.onclick = () => {
  panelCategorias.classList.add("hidden");
  resetearFormularioCategoria();
};

function resetearFormularioCategoria() {
  categoriaEnEdicionId = null;
  inputCatNombre.value = "";
  tituloFormCat.textContent = "Administrar Categorías";
  btnGuardarCategoria.textContent = "+ Crear Categoría";
  btnCancelarCat.classList.add("hidden");
  colorSeleccionado = GOOGLE_COLORES[0];
  catColorLabel.textContent = colorSeleccionado.nombre;
  renderizarPaletaColores();
}

btnCancelarCat.onclick = resetearFormularioCategoria;

btnGuardarCategoria.onclick = async () => {
  const nombre = inputCatNombre.value.trim();
  if (!nombre) return alert("Escribe un nombre para la categoría.");

  btnGuardarCategoria.disabled = true;
  try {
    const payload = {
      nombre,
      colorId: colorSeleccionado.colorId,
      hex: colorSeleccionado.hex
    };

    if (categoriaEnEdicionId) {
      await updateDoc(doc(db, "agenda_categorias", categoriaEnEdicionId), payload);
    } else {
      payload.creadoEn = new Date().toISOString();
      const nuevoDoc = await addDoc(categoriasRef, payload);
      selectCategoria.value = nuevoDoc.id;
    }
    resetearFormularioCategoria();
  } catch (err) {
    console.error(err);
    alert("Error al guardar categoría. Verifica las reglas de Firestore para 'agenda_categorias'.");
  } finally {
    btnGuardarCategoria.disabled = false;
  }
};

function renderizarUI_Categorias() {
  const valorSeleccionadoForm = selectCategoria.value;
  const valorSeleccionadoFiltro = selectFiltroCategoria.value;

  selectCategoria.innerHTML = "";
  categoriasCache.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.nombre;
    selectCategoria.appendChild(opt);
  });
  if (categoriasCache.some((c) => c.id === valorSeleccionadoForm)) {
    selectCategoria.value = valorSeleccionadoForm;
  }

  selectFiltroCategoria.innerHTML = `<option value="todas">Todas las categorías</option>`;
  categoriasCache.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.nombre;
    selectFiltroCategoria.appendChild(opt);
  });
  if (valorSeleccionadoFiltro === "todas" || categoriasCache.some((c) => c.id === valorSeleccionadoFiltro)) {
    selectFiltroCategoria.value = valorSeleccionadoFiltro;
  } else {
    filtroCategoriaActual = "todas";
  }

  listaCategoriasAdmin.innerHTML = "";
  categoriasCache.forEach((cat) => {
    const row = document.createElement("div");
    row.className = "item-categoria";
    row.innerHTML = `
      <div class="item-categoria-info">
        <span class="punto-cat" style="background:${cat.hex}; width:11px; height:11px;"></span>
        <span>${cat.nombre}</span>
      </div>
      <div style="display:flex; gap:0.35rem;">
        <button type="button" class="edit btn-edit-cat">Editar</button>
        <button type="button" class="danger btn-del-cat">Eliminar</button>
      </div>
    `;

    row.querySelector(".btn-edit-cat").onclick = () => {
      categoriaEnEdicionId = cat.id;
      inputCatNombre.value = cat.nombre;
      tituloFormCat.textContent = `Editando: ${cat.nombre}`;
      btnGuardarCategoria.textContent = "Guardar Cambios";
      btnCancelarCat.classList.remove("hidden");
      colorSeleccionado = GOOGLE_COLORES.find((c) => c.colorId === cat.colorId) || GOOGLE_COLORES[0];
      catColorLabel.textContent = colorSeleccionado.nombre;
      renderizarPaletaColores();
      inputCatNombre.focus();
    };

    row.querySelector(".btn-del-cat").onclick = async () => {
      if (categoriasCache.length <= 1) return alert("Debes mantener al menos una categoría activa.");
      if (!confirm(`¿Eliminar la categoría "${cat.nombre}"?`)) return;
      try {
        await deleteDoc(doc(db, "agenda_categorias", cat.id));
        if (categoriaEnEdicionId === cat.id) resetearFormularioCategoria();
      } catch (err) {
        console.error(err);
        alert("No se pudo eliminar la categoría.");
      }
    };

    listaCategoriasAdmin.appendChild(row);
  });
}

function obtenerCategoriaEvento(ev) {
  if (ev.categoria) {
    const encontrada = categoriasCache.find((c) => c.id === ev.categoria);
    if (encontrada) return encontrada;
  }
  return categoriasCache[0] || { id: "default", nombre: "General", colorId: "7", hex: "#039be5" };
}

const qCategorias = query(categoriasRef, orderBy("nombre", "asc"));

onSnapshot(qCategorias, async (snapshot) => {
  if (snapshot.empty && !semillaCategoriasIntentada) {
    semillaCategoriasIntentada = true;
    try {
      for (const base of CATEGORIAS_INICIALES) {
        await setDoc(doc(db, "agenda_categorias", base.id), {
          nombre: base.nombre,
          colorId: base.colorId,
          hex: base.hex,
          creadoEn: new Date().toISOString()
        });
      }
      return;
    } catch (e) {
      categoriasCache = [...CATEGORIAS_INICIALES];
      renderizarUI_Categorias();
      return;
    }
  }

  categoriasCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (categoriasCache.length === 0) categoriasCache = [...CATEGORIAS_INICIALES];

  renderizarUI_Categorias();
  if (eventosCache.length > 0) {
    renderizarListaEventos();
    if (!panelCalendario.classList.contains("hidden")) actualizarFullCalendar();
  }
});

// =========================================================================
// 4. HELPERS DE FECHAS, RECURRENCIA (SEMANAL/MENSUAL/ANUAL) Y CHECKLIST
// =========================================================================

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

selectRepeticion.addEventListener("change", () => {
  contenedorDiasSemana.classList.toggle("hidden", selectRepeticion.value !== "semanal");
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

function restarUnDia(fechaStr) {
  const [anio, mes, dia] = fechaStr.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia - 1));
  return fecha.toISOString().slice(0, 10);
}

function isoALocalInput(isoStr) {
  const fecha = new Date(isoStr);
  const offset = fecha.getTimezoneOffset() * 60000;
  return new Date(fecha - offset).toISOString().slice(0, 16);
}

function obtenerTipoRepeticion(ev) {
  if (ev.repeticion) return ev.repeticion;
  if (ev.repetirAnual) return "anual";
  return "ninguna";
}

function formatearEtiquetaRepeticion(ev) {
  const tipo = obtenerTipoRepeticion(ev);
  if (tipo === "anual") return "Anual";
  if (tipo === "mensual") return "Mensual";
  if (tipo === "semanal") {
    const dias = Array.isArray(ev.diasSemana) && ev.diasSemana.length > 0
      ? ` (${ev.diasSemana.map((d) => NOMBRES_DIAS[d] || d).join(", ")})`
      : "";
    return `Semanal${dias}`;
  }
  return "";
}

// Calcula la próxima ocurrencia según sea única, semanal, mensual o anual
function obtenerOcurrenciaRelevante(ev) {
  const ahora = new Date();
  let inicioDate = ev.todoElDia ? new Date(`${ev.inicio.slice(0, 10)}T00:00:00`) : new Date(ev.inicio);
  let finDate = ev.todoElDia ? new Date(`${ev.fin.slice(0, 10)}T23:59:59`) : new Date(ev.fin);
  const duracionMs = Math.max(0, finDate - inicioDate);
  const tipo = obtenerTipoRepeticion(ev);

  if (tipo === "anual") {
    inicioDate.setFullYear(ahora.getFullYear());
    finDate = new Date(inicioDate.getTime() + duracionMs);
    if (finDate < ahora) {
      inicioDate.setFullYear(ahora.getFullYear() + 1);
      finDate = new Date(inicioDate.getTime() + duracionMs);
    }
  } else if (tipo === "mensual") {
    const diaOriginal = inicioDate.getDate();
    let intentos = 0;
    while (finDate < ahora && intentos < 36) {
      const siguienteMes = inicioDate.getMonth() + 1;
      inicioDate.setDate(1);
      inicioDate.setMonth(siguienteMes);
      const maxDiasMes = new Date(inicioDate.getFullYear(), inicioDate.getMonth() + 1, 0).getDate();
      inicioDate.setDate(Math.min(diaOriginal, maxDiasMes));
      finDate = new Date(inicioDate.getTime() + duracionMs);
      intentos++;
    }
  } else if (tipo === "semanal") {
    const diasObjetivo = Array.isArray(ev.diasSemana) && ev.diasSemana.length > 0
      ? ev.diasSemana.map((d) => MAPA_DIAS_JS[d])
      : [inicioDate.getDay()];

    if (finDate < ahora) {
      // Partir desde hoy manteniendo la hora original del evento
      const candidato = new Date(
        ahora.getFullYear(), ahora.getMonth(), ahora.getDate(),
        inicioDate.getHours(), inicioDate.getMinutes(), inicioDate.getSeconds()
      );
      for (let i = 0; i < 14; i++) {
        const candFin = new Date(candidato.getTime() + duracionMs);
        if (diasObjetivo.includes(candidato.getDay()) && candFin >= ahora) {
          inicioDate = candidato;
          finDate = candFin;
          break;
        }
        candidato.setDate(candidato.getDate() + 1);
      }
    }
  }

  return { inicioDate, finDate };
}

function calcularCuentaRegresiva(ev) {
  const ahora = new Date();
  const tipo = obtenerTipoRepeticion(ev);
  const { inicioDate, finDate } = obtenerOcurrenciaRelevante(ev);

  if (tipo === "ninguna" && finDate < ahora) {
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

// Helpers Checklist <-> Descripción de Google Calendar
function construirDescripcionConChecklist(descripcionBase, subtareas) {
  const limpia = (descripcionBase || "").split("\n--- Checklist ---")[0].trim();
  if (!Array.isArray(subtareas) || subtareas.length === 0) return limpia;

  const lineas = subtareas.map((t) => `[${t.completada ? "✓" : " "}] ${t.texto}`);
  const bloque = `--- Checklist ---\n${lineas.join("\n")}`;
  return limpia ? `${limpia}\n\n${bloque}` : bloque;
}

function extraerDescripcionYChecklist(descGoogle) {
  if (!descGoogle) return { descripcion: "", subtareas: [] };
  const partes = descGoogle.split("\n--- Checklist ---");
  const descripcion = partes[0].trim();
  const subtareas = [];

  if (partes[1]) {
    partes[1].trim().split("\n").forEach((linea) => {
      const m = linea.match(/^\[(✓|x|X|\s)\]\s*(.+)$/);
      if (m) {
        subtareas.push({ completada: m[1].trim() !== "", texto: m[2].trim() });
      }
    });
  }
  return { descripcion, subtareas };
}

// =========================================================================
// 5. SUBTAREAS Y NOTIFICACIONES EN EL FORMULARIO
// =========================================================================

function crearFilaSubtarea(texto = "", completada = false) {
  const div = document.createElement("div");
  div.className = "fila-subtarea";
  div.dataset.completada = completada ? "true" : "false";
  div.innerHTML = `
    <input type="text" class="subtarea-texto" value="${texto.replace(/"/g, "&quot;")}" placeholder="Ej. Comprar regalo / Llevar apuntes">
    <button type="button" class="danger btn-quitar-sub" title="Quitar">✕</button>
  `;
  div.querySelector(".btn-quitar-sub").onclick = () => div.remove();
  return div;
}

btnAgregarSubtarea.onclick = () => {
  const fila = crearFilaSubtarea("", false);
  contenedorSubtareas.appendChild(fila);
  fila.querySelector("input").focus();
};

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

// =========================================================================
// 6. CRUD DE EVENTOS E IMPORTACIÓN DESDE GOOGLE CALENDAR
// =========================================================================

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
  document.getElementById("ubicacion").value = ev.ubicacion || "";
  document.getElementById("invitados").value = Array.isArray(ev.invitados) ? ev.invitados.join(", ") : "";
  selectCategoria.value = cat.id;
  checkTodoElDia.checked = Boolean(ev.todoElDia);

  const tipoRep = obtenerTipoRepeticion(ev);
  selectRepeticion.value = tipoRep;
  contenedorDiasSemana.classList.toggle("hidden", tipoRep !== "semanal");

  const diasMarcados = Array.isArray(ev.diasSemana) ? ev.diasSemana : [];
  contenedorDiasSemana.querySelectorAll("input[type='checkbox']").forEach((cb) => {
    cb.checked = diasMarcados.includes(cb.value);
  });

  actualizarTipoInputsFecha(Boolean(ev.todoElDia));

  if (ev.todoElDia) {
    inputInicio.value = ev.inicio.slice(0, 10);
    inputFin.value = ev.fin.slice(0, 10);
  } else {
    inputInicio.value = isoALocalInput(ev.inicio);
    inputFin.value = isoALocalInput(ev.fin);
  }
  inputFin.min = inputInicio.value;

  // Cargar checklist
  contenedorSubtareas.innerHTML = "";
  if (Array.isArray(ev.subtareas)) {
    ev.subtareas.forEach((t) => {
      contenedorSubtareas.appendChild(crearFilaSubtarea(t.texto, t.completada));
    });
  }

  // Cargar recordatorios
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
  contenedorDiasSemana.classList.add("hidden");
  contenedorSubtareas.innerHTML = "";
  actualizarTipoInputsFecha(false);
  inputFin.removeAttribute("min");
  contenedorRec.innerHTML = "";
  contenedorRec.appendChild(crearFilaRecordatorio(15, "1"));
}

btnCancelarEdicion.onclick = resetearFormulario;

formEvento.onsubmit = async (e) => {
  e.preventDefault();
  if (!accessToken) return alert("Primero conecta tu cuenta de Google.");

  const titulo = document.getElementById("titulo").value.trim();
  const descripcion = document.getElementById("descripcion").value.trim();
  const ubicacion = document.getElementById("ubicacion").value.trim();
  const invitadosRaw = document.getElementById("invitados").value;
  const invitados = invitadosRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));

  const categoriaId = selectCategoria.value;
  const catInfo = categoriasCache.find((c) => c.id === categoriaId) || { colorId: "7" };
  const inicioVal = inputInicio.value;
  const finVal = inputFin.value;
  const esTodoElDia = checkTodoElDia.checked;
  const repeticion = selectRepeticion.value;

  const diasSemana = [];
  if (repeticion === "semanal") {
    contenedorDiasSemana.querySelectorAll("input[type='checkbox']:checked").forEach((cb) => {
      diasSemana.push(cb.value);
    });
  }

  // Recopilar subtareas
  const subtareas = [];
  contenedorSubtareas.querySelectorAll(".fila-subtarea").forEach((fila) => {
    const txt = fila.querySelector(".subtarea-texto").value.trim();
    if (txt) {
      subtareas.push({ texto: txt, completada: fila.dataset.completada === "true" });
    }
  });

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

  // Regla RRULE para Google Calendar
  let recurrenceGoogle = null;
  if (repeticion === "anual") recurrenceGoogle = ["RRULE:FREQ=YEARLY"];
  if (repeticion === "mensual") recurrenceGoogle = ["RRULE:FREQ=MONTHLY"];
  if (repeticion === "semanal") {
    recurrenceGoogle = diasSemana.length > 0
      ? [`RRULE:FREQ=WEEKLY;BYDAY=${diasSemana.join(",")}`]
      : ["RRULE:FREQ=WEEKLY"];
  }

  const eventoGoogle = {
    summary: titulo,
    description: construirDescripcionConChecklist(descripcion, subtareas),
    location: ubicacion || null,
    colorId: catInfo.colorId,
    start: startGoogle,
    end: endGoogle,
    recurrence: recurrenceGoogle,
    attendees: invitados.length > 0 ? invitados.map((email) => ({ email })) : [],
    reminders: {
      useDefault: overridesGoogle.length === 0,
      overrides: overridesGoogle
    }
  };

  try {
    const esEdicion = Boolean(eventoEnEdicion);
    const baseUrl = esEdicion
      ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventoEnEdicion.googleEventId}`
      : "https://www.googleapis.com/calendar/v3/calendars/primary/events";
    const url = invitados.length > 0 ? `${baseUrl}?sendUpdates=all` : baseUrl;

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
      ubicacion,
      invitados,
      subtareas,
      categoria: categoriaId,
      todoElDia: esTodoElDia,
      repeticion,
      diasSemana,
      repetirAnual: repeticion === "anual",
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

// Importación bidireccional desde Google Calendar hacia Firestore
btnSyncGoogle.onclick = async () => {
  if (!accessToken) return alert("Conecta tu cuenta de Google primero.");

  btnSyncGoogle.disabled = true;
  btnSyncGoogle.textContent = "Sincronizando...";

  try {
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const params = new URLSearchParams({
      timeMin: inicioHoy.toISOString(),
      singleEvents: "false",
      maxResults: "100"
    });

    const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    if (resp.status === 401) {
      localStorage.removeItem("gcal_token");
      throw new Error("Tu sesión expiró. Presiona 'Renovar sesión de Google' e inténtalo de nuevo.");
    }
    if (!resp.ok) {
      throw new Error(`Error HTTP ${resp.status} al leer Google Calendar.`);
    }

    const data = await resp.json();
    const items = (data.items || []).filter((it) => it.status !== "cancelled" && it.start);

    let nuevos = 0;
    let actualizados = 0;

    for (const gEv of items) {
      const esTodoElDia = Boolean(gEv.start.date);
      let inicioFirestore, finFirestore;

      if (esTodoElDia) {
        const startStr = gEv.start.date;
        const endExclusivo = gEv.end?.date || sumarUnDia(startStr);
        const endInclusivo = restarUnDia(endExclusivo) < startStr ? startStr : restarUnDia(endExclusivo);
        inicioFirestore = `${startStr}T00:00:00`;
        finFirestore = `${endInclusivo}T23:59:59`;
      } else {
        inicioFirestore = new Date(gEv.start.dateTime).toISOString();
        finFirestore = new Date(gEv.end?.dateTime || gEv.start.dateTime).toISOString();
      }

      // Detectar recurrencia
      let repeticion = "ninguna";
      let diasSemana = [];
      if (Array.isArray(gEv.recurrence)) {
        const rrule = gEv.recurrence.find((r) => r.startsWith("RRULE:"));
        if (rrule) {
          if (rrule.includes("FREQ=YEARLY")) repeticion = "anual";
          else if (rrule.includes("FREQ=MONTHLY")) repeticion = "mensual";
          else if (rrule.includes("FREQ=WEEKLY")) {
            repeticion = "semanal";
            const matchDias = rrule.match(/BYDAY=([A-Z,]+)/);
            if (matchDias) diasSemana = matchDias[1].split(",");
          }
        }
      }

      // Mapear colorId de Google a categoría local
      const catMatch = categoriasCache.find((c) => c.colorId === gEv.colorId) || categoriasCache[0];
      const { descripcion, subtareas } = extraerDescripcionYChecklist(gEv.description || "");
      const invitados = Array.isArray(gEv.attendees)
        ? gEv.attendees.filter((a) => !a.self && a.email).map((a) => a.email)
        : [];
      const recordatorios = Array.isArray(gEv.reminders?.overrides)
        ? gEv.reminders.overrides.map((r) => r.minutes)
        : [];

      const existente = eventosCache.find((e) => e.data.googleEventId === gEv.id);

      const payload = {
        titulo: gEv.summary || "(Sin título)",
        descripcion,
        ubicacion: gEv.location || "",
        invitados,
        subtareas,
        categoria: catMatch ? catMatch.id : "personal",
        todoElDia: esTodoElDia,
        repeticion,
        diasSemana,
        repetirAnual: repeticion === "anual",
        inicio: inicioFirestore,
        fin: finFirestore,
        recordatorios,
        googleEventId: gEv.id
      };

      if (existente) {
        payload.actualizadoEn = new Date().toISOString();
        await updateDoc(doc(db, "agenda_eventos", existente.id), payload);
        actualizados++;
      } else {
        payload.creadoEn = new Date().toISOString();
        await addDoc(eventosRef, payload);
        nuevos++;
      }
    }

    alert(`Sincronización completada: ${nuevos} evento(s) nuevo(s) importado(s) y ${actualizados} actualizado(s).`);
  } catch (err) {
    console.error(err);
    alert(err.message);
  } finally {
    btnSyncGoogle.disabled = false;
    btnSyncGoogle.textContent = "↻ Traer eventos de Google";
  }
};

// =========================================================================
// 7. LISTA DE EVENTOS, CHECKLIST INTERACTIVA, WHATSAPP Y CONTADOR CYAN
// =========================================================================

async function alternarSubtareaEnTarjeta(docId, ev, indiceSubtarea, nuevoEstado) {
  const nuevasSubtareas = (ev.subtareas || []).map((t, i) =>
    i === indiceSubtarea ? { ...t, completada: nuevoEstado } : t
  );

  try {
    await updateDoc(doc(db, "agenda_eventos", docId), {
      subtareas: nuevasSubtareas,
      actualizadoEn: new Date().toISOString()
    });

    // Sincronizar checklist actualizado en la descripción de Google Calendar
    if (accessToken && ev.googleEventId) {
      const descActualizada = construirDescripcionConChecklist(ev.descripcion || "", nuevasSubtareas);
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.googleEventId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ description: descActualizada })
      });
    }
  } catch (err) {
    console.error("Error actualizando checklist:", err);
  }
}

function compartirPorWhatsApp(ev, fechaFormateada) {
  const lineas = [`*${ev.titulo}*`, `📅 ${fechaFormateada}`];
  const repLabel = formatearEtiquetaRepeticion(ev);
  if (repLabel) lineas.push(`🔁 Repetición: ${repLabel}`);
  if (ev.ubicacion) {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.ubicacion)}`;
    lineas.push(`📍 ${ev.ubicacion} (${mapsUrl})`);
  }
  if (ev.descripcion) lineas.push(`📝 ${ev.descripcion}`);

  const url = `https://wa.me/?text=${encodeURIComponent(lineas.join("\n"))}`;
  window.open(url, "_blank", "noopener");
}

function renderizarListaEventos() {
  listaEventos.innerHTML = "";

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
    const tipoRep = obtenerTipoRepeticion(ev);
    if (filtroActual === "proximos" && countdown.esPasado) return false;
    if (filtroActual === "recurrentes" && tipoRep === "ninguna") return false;
    if (filtroActual === "pasados" && !countdown.esPasado) return false;

    if (filtroCategoriaActual !== "todas" && ev.categoria !== filtroCategoriaActual) {
      return false;
    }

    if (textoBusqueda) {
      const q = textoBusqueda.toLowerCase();
      const coincideTitulo = (ev.titulo || "").toLowerCase().includes(q);
      const coincideDesc = (ev.descripcion || "").toLowerCase().includes(q);
      const coincideLugar = (ev.ubicacion || "").toLowerCase().includes(q);
      if (!coincideTitulo && !coincideDesc && !coincideLugar) return false;
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

    const repEtiqueta = formatearEtiquetaRepeticion(ev);
    const badgeTodoElDia = ev.todoElDia ? `<span class="badge">Todo el día</span>` : "";
    const badgeRecurrente = repEtiqueta ? `<span class="badge recurrente">${repEtiqueta}</span>` : "";
    const badgeInvitados = Array.isArray(ev.invitados) && ev.invitados.length > 0
      ? `<span class="badge invitados" title="${ev.invitados.join(", ")}">👥 ${ev.invitados.length}</span>`
      : "";

    const linkMapsHtml = ev.ubicacion
      ? `<br><a class="link-maps" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.ubicacion)}" target="_blank" rel="noopener">📍 ${ev.ubicacion} ↗</a>`
      : "";

    const claseCountdown = countdown.esPasado ? "pasado" : (countdown.esInminente ? "inminente" : "");

    const div = document.createElement("div");
    div.className = `evento ${countdown.esPasado ? "pasado" : ""}`;
    div.style.borderLeftColor = cat.hex;

    div.innerHTML = `
      <div class="evento-info">
        <div style="margin-bottom: 0.25rem;">
          <span class="badge-cat"><span class="punto-cat" style="background:${cat.hex};"></span>${cat.nombre}</span>
          ${badgeTodoElDia}${badgeRecurrente}${badgeInvitados}
        </div>
        <strong style="font-size:1.02rem;">${ev.titulo}</strong><br>
        ${ev.descripcion ? `<span style="font-size:0.85rem; color:#cbd5e1;">${ev.descripcion}</span><br>` : ""}
        <small style="color:#94a3b8;">${fechaFormateada}</small>${linkMapsHtml}<br>
        <small style="color:#7dd3fc;">Avisos: ${listaAvisos}</small>
        <div class="slot-checklist"></div>
        <span class="countdown-pill ${claseCountdown}">${countdown.texto}</span>
      </div>
      <div class="acciones-evento">
        <button class="whatsapp btn-whatsapp" type="button" title="Compartir por WhatsApp">WhatsApp</button>
        <button class="clone btn-duplicar" type="button" title="Clonar evento">Duplicar</button>
        <button class="edit btn-editar" type="button">Editar</button>
        <button class="danger btn-eliminar" type="button">Eliminar</button>
      </div>
    `;

    // Renderizar checklist interactivo si el evento tiene subtareas
    if (Array.isArray(ev.subtareas) && ev.subtareas.length > 0) {
      const completadas = ev.subtareas.filter((t) => t.completada).length;
      const box = document.createElement("div");
      box.className = "checklist-card";
      box.innerHTML = `<div class="checklist-titulo">Checklist (${completadas}/${ev.subtareas.length})</div>`;

      ev.subtareas.forEach((sub, idx) => {
        const label = document.createElement("label");
        label.className = `checklist-item ${sub.completada ? "hecha" : ""}`;
        label.innerHTML = `
          <input type="checkbox" ${sub.completada ? "checked" : ""}>
          <span>${sub.texto}</span>
        `;
        label.querySelector("input").onchange = (e) => {
          alternarSubtareaEnTarjeta(docId, ev, idx, e.target.checked);
        };
        box.appendChild(label);
      });

      div.querySelector(".slot-checklist").appendChild(box);
    }

    div.querySelector(".btn-whatsapp").onclick = () => compartirPorWhatsApp(ev, fechaFormateada);
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

buscadorEventos.addEventListener("input", (e) => {
  textoBusqueda = e.target.value.trim();
  renderizarListaEventos();
});

selectFiltroCategoria.addEventListener("change", (e) => {
  filtroCategoriaActual = e.target.value;
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

setInterval(() => {
  if (eventosCache.length > 0) renderizarListaEventos();
}, 60000);

// =========================================================================
// 8. VISTA CALENDARIO MENSUAL INTERACTIVO (FULLCALENDAR)
// =========================================================================

function construirEventosFullCalendar() {
  const eventosFC = [];
  const ahora = new Date();
  const anioActual = ahora.getFullYear();

  eventosCache.forEach(({ id: docId, data: ev }) => {
    const cat = obtenerCategoriaEvento(ev);
    const tipoRep = obtenerTipoRepeticion(ev);

    const agregarOcurrenciaFC = (sufijo, startISO, endISO) => {
      if (ev.todoElDia) {
        eventosFC.push({
          id: `${docId}_${sufijo}`,
          title: ev.titulo,
          start: startISO.slice(0, 10),
          end: sumarUnDia(endISO.slice(0, 10)),
          allDay: true,
          backgroundColor: cat.hex,
          borderColor: cat.hex,
          extendedProps: { docId, ev }
        });
      } else {
        eventosFC.push({
          id: `${docId}_${sufijo}`,
          title: ev.titulo,
          start: startISO,
          end: endISO,
          allDay: false,
          backgroundColor: cat.hex,
          borderColor: cat.hex,
          extendedProps: { docId, ev }
        });
      }
    };

    if (tipoRep === "ninguna") {
      agregarOcurrenciaFC("unico", ev.inicio, ev.fin);
    } else if (tipoRep === "anual") {
      [anioActual - 1, anioActual, anioActual + 1].forEach((anio) => {
        agregarOcurrenciaFC(`y_${anio}`, `${anio}${ev.inicio.slice(4)}`, `${anio}${ev.fin.slice(4)}`);
      });
    } else if (tipoRep === "mensual") {
      const baseStart = new Date(ev.inicio);
      const baseEnd = new Date(ev.fin);
      const duracionMs = baseEnd - baseStart;
      const diaOriginal = baseStart.getDate();

      for (let offsetMes = -2; offsetMes <= 10; offsetMes++) {
        const dStart = new Date(anioActual, ahora.getMonth() + offsetMes, 1, baseStart.getHours(), baseStart.getMinutes());
        const maxDias = new Date(dStart.getFullYear(), dStart.getMonth() + 1, 0).getDate();
        dStart.setDate(Math.min(diaOriginal, maxDias));
        const dEnd = new Date(dStart.getTime() + duracionMs);

        if (ev.todoElDia) {
          const ymd = `${dStart.getFullYear()}-${String(dStart.getMonth() + 1).padStart(2, "0")}-${String(dStart.getDate()).padStart(2, "0")}`;
          agregarOcurrenciaFC(`m_${offsetMes}`, `${ymd}T00:00:00`, `${ymd}T23:59:59`);
        } else {
          agregarOcurrenciaFC(`m_${offsetMes}`, dStart.toISOString(), dEnd.toISOString());
        }
      }
    } else if (tipoRep === "semanal") {
      const baseStart = new Date(ev.inicio);
      const baseEnd = new Date(ev.fin);
      const duracionMs = baseEnd - baseStart;
      const diasObjetivo = Array.isArray(ev.diasSemana) && ev.diasSemana.length > 0
        ? ev.diasSemana.map((d) => MAPA_DIAS_JS[d])
        : [baseStart.getDay()];

      const cursor = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 28, baseStart.getHours(), baseStart.getMinutes());
      for (let d = 0; d < 140; d++) {
        if (diasObjetivo.includes(cursor.getDay())) {
          const dEnd = new Date(cursor.getTime() + duracionMs);
          if (ev.todoElDia) {
            const ymd = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
            agregarOcurrenciaFC(`w_${d}`, `${ymd}T00:00:00`, `${ymd}T23:59:59`);
          } else {
            agregarOcurrenciaFC(`w_${d}`, cursor.toISOString(), dEnd.toISOString());
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
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
