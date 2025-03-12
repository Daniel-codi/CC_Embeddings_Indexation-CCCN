const path = require('path');
const fs = require('fs');

// Cargar variables de entorno
const MAX_HISTORIAL = process.env.MAX_HISTORIAL || 2; //máximo de consultas almacenadas en memoria

let Historial = []; // Historial global

//====================================================================
//-- Función: Actualiza el historial de la conversación --------------
//====================================================================
function actualizarHistorial(pregunta, respuesta) {
    Historial.push({ pregunta, respuesta });

    // Mantener solo las últimas MAX_HISTORIAL interacciones
    if (Historial.length > MAX_HISTORIAL) {
        Historial.shift(); // Elimina la interacción más antigua
    }
}

//====================================================================
//-- Función: Obtiene el historial actual de la conversación ---------
//====================================================================
function obtenerHistorial() {
    return Historial;
}


//====================================================================
//-- Exportar todas las funciones correctamente ----------------------
//====================================================================
module.exports = {
    actualizarHistorial,
    obtenerHistorial,
};
