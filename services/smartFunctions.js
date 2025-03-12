const axios = require('axios');
const fs = require('fs');
const path = require('path');

// API Key de configuración
const API_KEY = process.env.API_KEY;


//===========================================================================================
// * Smart-Function: pulir la Pregunta Consulta
// * Ingresa: consulta original, contexto, historial de la conversación
// * Devuelve: consultaPulida, tokens_in, tokens_out
//===========================================================================================

async function pulirPregunta(preguntaOriginal, contextoPermitido, historial) {
    // Convertir el historial (array) en texto estructurado
    const historialTexto = historial.map((item, index) => 
        `Pregunta (-${historial.length - index}): ${item.pregunta}\nRespuesta (-${historial.length - index}): ${item.respuesta}`
    ).join('\n');

    const pulirPreguntaReq = {
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: `El contexto adicional es: ${contextoPermitido}\n\nEl historial es el siguiente:\n${historialTexto}\n\nLa última pregunta es: "${preguntaOriginal}".` },
            { role: "user", content: "Reformula la última pregunta o consulta, considerando el contexto y el historial. Devuelve únicamente la pregunta reformulada, sin explicaciones, introducciones ni comentarios adicionales." }
        ],
        max_tokens: 120,
        temperature: 0.1
    };

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            pulirPreguntaReq,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Extraer tokens utilizados
        const tokens_in = response.data.usage?.prompt_tokens || 0;
        const tokens_out = response.data.usage?.completion_tokens || 0;

        // Obtener la consulta pulida
        const consultaPulida = response.data.choices[0].message.content.trim();

        // Imprimir contexto y pregunta pulida
        //console.log(` `);
        //console.log("Contexto utilizado:", contextoPulido);
        //console.log("Pregunta pulida:", consultaPulida);

        // Retornar los tres valores
        return { consultaPulida, tokens_in, tokens_out };
    } catch (error) {
        console.error(`Error al pulir la pregunta: ${error.message}`);
        
        // En caso de error, devolver la pregunta original y 0 tokens
        return { consultaPulida: preguntaOriginal, tokens_in: 0, tokens_out: 0 };
    }
}


//===========================================================================================
// * Smart-Function: identifica archivos relevantes
// * ingresa: preguntaPulida, el índice de Documento, la cantidad max de chunks a consultar
// * devuelve: archivosRelevantes, tokens_in, tokens_out
//===========================================================================================

async function identificarArchivos(preguntaPulida, documentIndex, maxChunks) {
    const primerRequerimiento = {
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "Eres experto en indexación basada en Concept Curve Embeddings." },
			{ role: "user", content: `Pregunta: ${preguntaPulida}\n\nLee el índice de documentos:\n${documentIndex}\n\n
			    - Solo está permitido responder usando los nombres exactos de los archivos, tal como aparecen en el índice (incluyendo ceros a la izquierda).
				- Indica hasta ${maxChunks} archivos relevantes, separados por comas. 
				- No modifiques los nombres en ningún caso. No hagas ninguna otra aclaracion u opinion.` }
        ],
        max_tokens: 100,
        temperature: 0.2
    };

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            primerRequerimiento,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Extraer tokens utilizados
        const tokens_in = response.data.usage?.prompt_tokens || 0;
        const tokens_out = response.data.usage?.completion_tokens || 0;

        // Manejo seguro de archivosRelevantes
        const archivosRelevantesTexto = response.data.choices?.[0]?.message?.content?.trim();
        let archivosRelevantes = archivosRelevantesTexto
            ? archivosRelevantesTexto.split(',').map(file => file.trim())
            : [];

        // Función para normalizar nombres de archivos
        const normalizarArchivo = (file) => {
            return file
                .normalize("NFD").replace(/[̀-ͯ]/g, "") // Eliminar acentos
                .replace(/\.$/, ""); // Eliminar punto final si existe
        };

        // Aplicar normalización a cada archivo
        archivosRelevantes = archivosRelevantes.map(normalizarArchivo);

        // Retornar los tres valores
        return { archivosRelevantes, tokens_in, tokens_out };
    } catch (error) {
        console.error(`Error en identificarArchivos: ${error.message}`);
        
        // En caso de error, devolver valores seguros
        return { archivosRelevantes: [], tokens_in: 0, tokens_out: 0 };
    }
}



//===========================================================================================
// * Smart-Function: examina los chunks y construye respuestas
// * Ingresa: archivos donde buscar, textoConsulta (preguntaOriginal + preguntaPulida), maxRespuestas
// * devuelve: respuestaFinal, chunksExaminados, cantRespPositivas, tokens_in, tokens_out 
//===========================================================================================

async function construirRespuesta(archivos, textoConsulta, maxRespuestas) {
    let respuestaFinal = "";
    let cantRespPositivas = 0;
    let chunksExaminados = 0;
    let tokens_in = 0;
    let tokens_out = 0;

    for (const archivo of archivos) {
        if (cantRespPositivas >= maxRespuestas) break;

        const archivoPath = path.join(__dirname, '../data', archivo);

        if (!fs.existsSync(archivoPath)) {
            console.error(`El archivo ${archivo} no existe.`);
            continue;
        }

        const contenidoArchivo = fs.readFileSync(archivoPath, 'utf8');
        const segundoRequerimiento = {
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Responde preguntas basadas estrictamente en el contenido del documento cargado. " },
                { role: "user", content: `Pregunta: ${textoConsulta}\n\nDocumento:\n${contenidoArchivo}\n\n 
				    - menciona también el índice, y/o Sección, y/o Artículo legal, y/o Capítulo y versículo donde encontraste la respuesta,
					- y agrega la cita textual. No infieras, no completes, no hagas suposiciones. Si no encuentras la respuesta responde "-" un solo carácter` }
            ],
            max_tokens: 400,
            temperature: 0.1
        };

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                segundoRequerimiento,
                {
                    headers: {
                        'Authorization': `Bearer ${API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            tokens_in += response.data.usage?.prompt_tokens || 0;
            tokens_out += response.data.usage?.completion_tokens || 0;

            let respuestaChunk = response.data.choices[0].message.content.trim();
            chunksExaminados++;

            

            if (respuestaChunk !== '-') {
                respuestaFinal += `${respuestaChunk}\n\n`;
                cantRespPositivas++;
                console.log(`Respuesta del chunk [${archivo}] -> positiva`);
                //console.log(`Contenido:\n${respuestaChunk}\n`);//*******************************************
            } else {
                console.log(`Respuesta del chunk [${archivo}] -> -`);
            }

        } catch (error) {
            console.error(`Error en construirRespuesta: ${error.message}`);
        }
    }

    if (cantRespPositivas === 0) {
        respuestaFinal = "La respuesta a la consulta no se encuentra en el documento examinado.";
    }

    return { respuestaFinal, chunksExaminados, cantRespPositivas, tokens_in, tokens_out };
}



//===========================================================================================
// * Smart-Function: pule la respuesta final y aplica formato Markdown
// * Ingresa: consulta pulida, contexto permitido, respuesta final
// * Devuelve: respuestaPulida, tokens_in, tokens_out
//===========================================================================================
const outputTokens = parseInt(process.env.OUTPUT_TOKENS, 10) || 1200;  //máximo de tokens para respuesta final

async function pulirRespuesta(pregunta, contextoPermitido, respuestaFinal) {
    const refinamientoPrompt = {
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: `Organiza y presenta las respuestas de manera armoniosa como una sola respuesta. 
                - Usa Formato Markdown. Usa **negritas** para resaltar ideas principales. 
                - Usa viñetas y saltos de línea para mejorar la legibilidad, pero NO uses encabezados (#, ##, ###).
                - Mantén todo en el mismo tamaño de fuente sin títulos grandes. **No generes información fuera del contexto permitido**.
				- Solo puedes responder en base a los siguientes contextos: ${contextoPermitido}.
                - Si la respuesta no pertenece a estos contextos, indica que la consulta está fuera del contexto permitido.` },
            { role: "user", content: `Pregunta: ${pregunta}. 
                Organiza esta respuesta y No agregues ningún dato fuera de lo que está aquí: ${respuestaFinal},
				- elimina las referencias negativas si hay respuestas positivas.
                - No autocomplete, no agregues opinion ni suposiciones.` }
        ],
        max_tokens: outputTokens,
        temperature: 0.2
    };

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            refinamientoPrompt,
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Extraer tokens utilizados
        const tokens_in = response.data.usage?.prompt_tokens || 0;
        const tokens_out = response.data.usage?.completion_tokens || 0;

        // Obtener la respuesta pulida
        const respuestaPulida = response.data.choices[0].message.content.trim();

        // Retornar los tres valores
        return { respuestaPulida, tokens_in, tokens_out };
    } catch (error) {
        console.error(`Error en pulirRespuesta: ${error.message}\nStack Trace: ${error.stack}`);

        // En caso de error, devolver valores seguros
        return { respuestaPulida: "No se encontró información válida dentro del contexto permitido.", tokens_in: 0, tokens_out: 0 };
    }
}


module.exports = {
    pulirPregunta,
    identificarArchivos,
    construirRespuesta,
    pulirRespuesta
};

