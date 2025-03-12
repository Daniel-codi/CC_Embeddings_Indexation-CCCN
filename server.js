// Importación de módulos necesarios
const express = require('express'); // Framework para manejar el servidor y las rutas
const bodyParser = require('body-parser'); // Middleware para procesar datos JSON en las solicitudes
const cors = require('cors'); // Middleware para habilitar CORS
const consultaRoutes = require('./services/consulta'); // Importación de las rutas de consulta

// Creación de la aplicación Express
const app = express();

//==============================================================================
//  Configuración de la Aplicación
//============================================================================== 

// Configuración de CORS
const corsOptions = {
    origin: '*', // Reemplaza con la URL de tu frontend en producción
    methods: ['POST']
};

// Habilitar CORS con la configuración personalizada
app.use(cors(corsOptions));

// Permitir el uso de JSON en las solicitudes HTTP
app.use(bodyParser.json());

// Registrar las rutas de consulta bajo el prefijo '/api'
app.use('/api', consultaRoutes);

//==============================================================================
// Configuración del Servidor
//==============================================================================

// Definir el puerto en el que el servidor escuchará las solicitudes
const PORT = process.env.PORT || 3000;

// Iniciar el servidor y escuchar en el puerto definido
app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
