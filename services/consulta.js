require('dotenv').config(); // Cargar las variables de entorno desde el archivo .env

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Importar las SmartFunctions (funciones que usan IA)
const { pulirPregunta, identificarArchivos, construirRespuesta, pulirRespuesta } = require('./smartFunctions');

// Importar funciones auxiliares
const { actualizarHistorial, obtenerHistorial } = require('./functions');

// Crear y exportar el router
const router = express.Router();

// Importar Configuración de Usuario desde .env
const maxChunks = parseInt(process.env.MAX_CHUNKS, 10) || 5;           //máximo de frangmentos a buscar
const maxRespuestas = parseInt(process.env.MAX_ANSWERS, 10) || 3;      //máximo de respuestas válidas


// Leer archivos de contexto una sola vez (mejora rendimiento)
const contextIndexPath = path.join(__dirname, '../data', '_Context_Index.txt');
const documentIndexPath = path.join(__dirname, '../data', '_Document_Index.txt');

const contextoPermitido = fs.readFileSync(contextIndexPath, 'utf8'); 
const documentIndex = fs.readFileSync(documentIndexPath, 'utf8'); 

//==============================================================================
//=========  Ruta Principal - maneja las consultas en 6 pasos  =================
//==============================================================================

router.post('/consulta', async (req, res) => {
    console.log(" ");
    console.log("Consulta recibida:", req.body.pregunta);
    const preguntaOriginal = req.body.pregunta;

    // Inicializar contadores de tokens locales
    let tokens_in = 0;
    let tokens_out = 0;

    //==================================================================
    //  Paso 1: SmartFunction - Pulir la pregunta
    //==================================================================
    let consultaPulida;
    try {
        const historial = obtenerHistorial();
    
        const resultadoPulido = await pulirPregunta(preguntaOriginal, contextoPermitido, historial);

        consultaPulida = resultadoPulido.consultaPulida;
        tokens_in += resultadoPulido.tokens_in;
        tokens_out += resultadoPulido.tokens_out;

        console.log(" ");
        console.log("Pregunta pulida:", consultaPulida);
    } catch (error) {
        console.error("Error al pulir la pregunta:", error);
        return res.status(500).json({ error: 'Error al reformular la pregunta.' });
    }

    //==================================================================
    //  Paso 2: SmartFunction - Identificar archivos relevantes
    //==================================================================
	
	
    let archivosRelevantes;
    try {
        const resultadoArchivos = await identificarArchivos(consultaPulida, documentIndex, maxChunks);
        
        archivosRelevantes = resultadoArchivos.archivosRelevantes;
        tokens_in += resultadoArchivos.tokens_in;
        tokens_out += resultadoArchivos.tokens_out;
        console.log(" ");
        console.log("Archivos relevantes identificados:", archivosRelevantes);
        console.log(" ");
        
    } catch (error) {
        console.error("Error al identificar archivos relevantes:", error);
        return res.status(500).json({ error: 'Error al identificar los archivos relevantes.' });
    }

    //==================================================================
    //  Paso 3: SmartFunction - Construir respuesta
    //==================================================================
    let respuestaFinal;
    let chunksExaminados = 0;
    let cantRespPositivas = 0;
    try {
        const textoConsulta = `${preguntaOriginal}\n${consultaPulida}`;
        const resultadoRespuesta = await construirRespuesta(archivosRelevantes, textoConsulta, maxRespuestas);
                
        respuestaFinal = resultadoRespuesta.respuestaFinal;
        chunksExaminados = resultadoRespuesta.chunksExaminados;
        cantRespPositivas = resultadoRespuesta.cantRespPositivas;
        tokens_in += resultadoRespuesta.tokens_in;
        tokens_out += resultadoRespuesta.tokens_out;
        
    } catch (error) {
        console.error("Error al construir la respuesta:", error);
        return res.status(500).json({ error: 'Error al construir la respuesta.' });
    }

    //================================================================== 
    // Paso 4: SmartFunction - Pulir respuesta
    //==================================================================     
    if (cantRespPositivas > 0) {
        try {
            const resultadoPulido = await pulirRespuesta(consultaPulida, contextoPermitido, respuestaFinal);
            respuestaFinal = resultadoPulido.respuestaPulida;
            tokens_in += resultadoPulido.tokens_in;
            tokens_out += resultadoPulido.tokens_out;
        } catch (error) {
            console.error("Error en el refinamiento de la respuesta:", error);
            return res.status(500).json({ error: 'Hubo un problema al refinar la respuesta.' });
        }
    }

    //================================================================== 
    // Paso 5: Function - Actualizar historial de la consulta
    //================================================================== 
    actualizarHistorial(consultaPulida, respuestaFinal);

    //================================================================== 
    // Paso 6: Calcular el costo, métricas y devolver respuesta Final
    //==================================================================
    
    const Costo = (tokens_in * 0.15 / 1000000) + (tokens_out * 0.60 / 1000000);
    const CostoFormateado = Costo.toFixed(4); // Mostrar con 4 decimales
    
    console.log(" ");
    console.log("-------------------------------------------");
    console.log(`Chunks examinados = ${chunksExaminados}`);
    console.log(`Respuestas positivas = ${cantRespPositivas}`);
    console.log(`Tokens_in = ${tokens_in}`);
    console.log(`Tokens_out = ${tokens_out}`);
    console.log(`Costo final de la consulta: ${CostoFormateado} u$d`);
    console.log("-------------------------------------------");
    console.log(" ");

    res.json({ respuestaFinal });
});

module.exports = router;
