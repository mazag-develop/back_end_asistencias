# Guía de integración del frontend

Contrato de integración para el backend del sistema de asistencias. Dirigido al
frontend Angular; documenta los campos de personas, las rutas de carga masiva
y auditoría, ejemplos de solicitudes y el flujo recomendado de pantallas.

## Conexión

| Entorno    | URL base                    |
| ---------- | --------------------------- |
| Desarrollo | `http://localhost:3000/api` |

- Todas las rutas de esta guía ya incluyen `/api`.
- Swagger: `http://localhost:3000/api/docs`.
- CORS está habilitado para `http://localhost:4200`.
- Actualmente no hay autenticación configurada ni se requiere token.
- Las respuestas de personas incluyen `documento` y `dni`. En las nuevas
  solicitudes, enviar `dni`; `documento` se acepta como alias legado.

## Tipos y campos de persona

Valores de `tipo`:

- `ESTUDIANTE`
- `PROFESOR`

`DOCENTE` es un valor de `cargo`, no un valor de `tipo`.

| Campo       | Obligatorio                   | Regla                                 |
| ----------- | ----------------------------- | ------------------------------------- |
| `codigo`    | Sí al crear                   | Entre 3 y 50 caracteres; único        |
| `dni`       | Sí al crear                   | Entre 8 y 20 dígitos; único           |
| `nombres`   | Sí al crear                   | Entre 2 y 100 caracteres              |
| `apellidos` | Sí al crear                   | Entre 2 y 100 caracteres              |
| `tipo`      | Sí al crear                   | `ESTUDIANTE` o `PROFESOR`             |
| `grado`     | Sí para estudiante            | Entre 1 y 50 caracteres               |
| `seccion`   | Sí para estudiante            | Entre 1 y 20 caracteres               |
| `cargo`     | Sí para personal (`PROFESOR`) | Uno de los valores permitidos         |
| `activo`    | No                            | Booleano; valor predeterminado `true` |

Valores permitidos para `cargo`:

```text
DOCENTE
DIRECTOR(A)
ADMINISTRATIVO
SECRETARIA(O)
AUXILIAR
```

Los campos específicos del otro tipo deben omitirse o quedar vacíos. Los
estudiantes no envían `cargo`; el personal no envía `grado` ni `seccion`.
`activo: false` significa deshabilitado. Deshabilitar no elimina la persona ni
su historial, pero impide registrar asistencia por escaneo.

### Crear estudiante

`POST /api/personas`

```json
{
  "codigo": "EST-00001",
  "dni": "12345678",
  "nombres": "Ana",
  "apellidos": "Pérez",
  "tipo": "ESTUDIANTE",
  "grado": "5to",
  "seccion": "A",
  "activo": true
}
```

### Crear personal

`POST /api/personas`

```json
{
  "codigo": "PER-00001",
  "dni": "87654321",
  "nombres": "Luis",
  "apellidos": "García",
  "tipo": "PROFESOR",
  "cargo": "DOCENTE",
  "activo": true
}
```

La respuesta devuelve la persona creada. Para compatibilidad, contiene tanto
`documento` como `dni`:

```json
{
  "id": 1,
  "codigo": "EST-00001",
  "documento": "12345678",
  "dni": "12345678",
  "nombres": "Ana",
  "apellidos": "Pérez",
  "tipo": "ESTUDIANTE",
  "activo": true,
  "grado": "5to",
  "seccion": "A",
  "cargo": null,
  "createdAt": "2026-11-01T10:00:00.000Z",
  "updatedAt": "2026-11-01T10:00:00.000Z"
}
```

## Endpoints de personas

| Método  | Ruta                           | Uso                         |
| ------- | ------------------------------ | --------------------------- |
| `GET`   | `/api/personas`                | Listar y filtrar personas   |
| `GET`   | `/api/personas/:id`            | Consultar por identificador |
| `GET`   | `/api/personas/codigo/:codigo` | Consultar por código        |
| `POST`  | `/api/personas`                | Crear persona               |
| `PATCH` | `/api/personas/:id`            | Actualizar persona          |
| `PATCH` | `/api/personas/:id/estado`     | Habilitar o deshabilitar    |

### Listado y paginación

`GET /api/personas` admite los parámetros:

| Parámetro | Uso                                                  |
| --------- | ---------------------------------------------------- |
| `codigo`  | Búsqueda parcial por código                          |
| `tipo`    | `ESTUDIANTE` o `PROFESOR`                            |
| `pagina`  | Página; por defecto `1`                              |
| `limite`  | Elementos por página; por defecto `10`, máximo `100` |

Ejemplo:

```text
GET /api/personas?tipo=ESTUDIANTE&codigo=EST-&pagina=1&limite=10
```

Respuesta paginada:

```json
{
  "data": [],
  "paginacion": {
    "total": 0,
    "pagina": 1,
    "limite": 10,
    "totalPaginas": 0
  }
}
```

### Actualizar y cambiar estado

`PATCH /api/personas/:id` acepta uno o más campos de persona; se debe enviar
al menos uno. Cuando se cambia el tipo o sus campos específicos, también se
deben enviar los campos obligatorios para el nuevo tipo.

`PATCH /api/personas/1/estado`:

```json
{
  "activo": false
}
```

## Carga masiva de personas

La carga tiene dos fases: validar y mostrar resultados antes de importar. El
backend procesa el archivo y aplica las validaciones; el frontend permite
seleccionarlo, muestra la vista previa y errores, solicita confirmación y
presenta el resultado final.

### Endpoints

| Método | Ruta                                   | Descripción                                   |
| ------ | -------------------------------------- | --------------------------------------------- |
| `GET`  | `/api/personas/carga-masiva/plantilla` | Descarga `plantilla-personas.xlsx`            |
| `POST` | `/api/personas/carga-masiva/validar`   | Valida y genera vista previa; no guarda datos |
| `POST` | `/api/personas/carga-masiva/importar`  | Revalida e importa las filas válidas          |

### Archivo y columnas

- Formato `.xlsx`, máximo 5 MB y 1.000 filas de datos.
- El backend lee la primera hoja. En la plantilla descargada se llama
  `Personas`; la segunda hoja `Instrucciones` explica los campos.
- La primera fila debe incluir estos nombres de columna, en este orden:

```text
codigo,dni,nombres,apellidos,tipo,grado,seccion,cargo,estado
```

- `codigo`, `dni`, `nombres`, `apellidos` y `tipo` son obligatorios.
- `grado` y `seccion` son obligatorios para `ESTUDIANTE` y deben quedar vacíos
  para `PROFESOR`.
- `cargo` es obligatorio para `PROFESOR` y debe quedar vacío para
  `ESTUDIANTE`.
- `estado` es opcional: vacío se convierte en habilitado. Si se informa, debe
  ser `HABILITADO` o `DESHABILITADO`.
- El archivo se envía como `multipart/form-data` con el campo `archivo`.

### Flujo recomendado

1. Ofrecer un botón **Descargar plantilla**.
2. Permitir seleccionar el `.xlsx` y mostrar su nombre y tamaño.
3. Enviar el archivo a la ruta de validación.
4. Mostrar el resumen y los errores por fila/campo. `registros` contiene solo
   filas válidas.
5. Si hay filas válidas, solicitar confirmación explícita. Indicar que las
   filas rechazadas no se guardarán.
6. Después de confirmar, enviar el archivo a la ruta de importación.
7. Mostrar el resumen final y permitir corregir errores y volver a cargar.

La validación no guarda datos. La importación vuelve a validar el archivo y
crea las filas válidas; las filas inválidas o duplicadas se rechazan
individualmente. No se actualizan personas existentes. El guardado de las
filas válidas y sus eventos de auditoría se realiza en una transacción.

### Validar con Angular `HttpClient`

```ts
const formData = new FormData();
formData.append('archivo', archivoSeleccionado);

this.http
  .post<ResultadoValidacion>(
    `${environment.apiUrl}/personas/carga-masiva/validar`,
    formData,
  )
  .subscribe((resultado) => {
    // Mostrar resumen, errores y filas válidas para confirmar.
  });
```

No establecer manualmente `Content-Type` para `FormData`; el navegador debe
agregar el `boundary`.

Después de confirmar, enviar el archivo a:

```ts
const formData = new FormData();
formData.append('archivo', archivoSeleccionado);

this.http
  .post<ResultadoImportacion>(
    `${environment.apiUrl}/personas/carga-masiva/importar`,
    formData,
  )
  .subscribe((resultado) => {
    // Mostrar creadas, rechazadas y errores.
  });
```

### Respuesta de validación

```json
{
  "totalFilas": 2,
  "validas": 1,
  "rechazadas": 1,
  "errores": [
    {
      "fila": 3,
      "campo": "seccion",
      "mensaje": "La sección es obligatoria"
    }
  ],
  "registros": [
    {
      "fila": 2,
      "codigo": "EST-00001",
      "dni": "12345678",
      "nombres": "Ana",
      "apellidos": "Pérez",
      "tipo": "ESTUDIANTE",
      "grado": "5to",
      "seccion": "A",
      "cargo": null,
      "activo": true
    }
  ]
}
```

`errores.fila` usa el número real de la fila en Excel, incluida la fila de
encabezados.

Tipos sugeridos en TypeScript:

```ts
export interface ErrorCargaPersona {
  fila: number;
  campo: string;
  mensaje: string;
}

export interface RegistroCargaPersona {
  fila: number;
  codigo: string;
  dni: string;
  nombres: string;
  apellidos: string;
  tipo: 'ESTUDIANTE' | 'PROFESOR';
  grado: string | null;
  seccion: string | null;
  cargo:
    | 'DOCENTE'
    | 'DIRECTOR(A)'
    | 'ADMINISTRATIVO'
    | 'SECRETARIA(O)'
    | 'AUXILIAR'
    | null;
  activo: boolean;
}

export interface ResultadoValidacion {
  totalFilas: number;
  validas: number;
  rechazadas: number;
  errores: ErrorCargaPersona[];
  registros: RegistroCargaPersona[];
}

export interface ResultadoImportacion {
  totalFilas: number;
  creadas: number;
  rechazadas: number;
  errores: ErrorCargaPersona[];
}
```

### Descargar la plantilla con Angular `HttpClient`

```ts
this.http
  .get(`${environment.apiUrl}/personas/carga-masiva/plantilla`, {
    responseType: 'blob',
  })
  .subscribe((blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-personas.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  });
```

## Auditoría

`GET /api/auditoria` devuelve hasta 100 eventos recientes combinados de
personas y asistencias. No recibe filtros ni parámetros de paginación.

```json
{
  "success": true,
  "data": [
    {
      "entidad": "PERSONA",
      "id": 1,
      "personaId": 1,
      "accion": "CARGA_MASIVA",
      "datosAnteriores": null,
      "datosNuevos": {
        "codigo": "EST-00001",
        "documento": "12345678"
      },
      "actorId": null,
      "fechaHora": "2026-11-01T10:00:00.000Z",
      "persona": {
        "id": 1,
        "codigo": "EST-00001",
        "nombres": "Ana",
        "apellidos": "Pérez"
      }
    }
  ]
}
```

Acciones de personas: `CREAR`, `CARGA_MASIVA`, `ACTUALIZAR`, `HABILITAR` y
`DESHABILITAR`. El escaneo de asistencia genera la acción `CREAR`. `actorId`
es `null` mientras no haya autenticación de usuarios.

## Otros endpoints existentes

| Método | Ruta                              | Uso                                 |
| ------ | --------------------------------- | ----------------------------------- |
| `GET`  | `/api/dashboard`                  | Métricas y últimas asistencias      |
| `POST` | `/api/asistencias/scan`           | Registrar con `{ "codigo": "..." }` |
| `GET`  | `/api/asistencias`                | Historial paginado y filtrable      |
| `GET`  | `/api/asistencias/diaria`         | Resumen diario; acepta `tipo`       |
| `GET`  | `/api/asistencias/resumen`        | Conteos de asistencias              |
| `GET`  | `/api/reportes/asistencias`       | Reporte JSON                        |
| `GET`  | `/api/reportes/asistencias/excel` | Descarga del reporte Excel          |

### Reporte de asistencias: hora y código de estado

Ambas rutas de reporte incluyen la hora de registro y el código abreviado del
estado:

- `P`: presente; asistió puntual (`PUNTUAL`).
- `T`: tardanza (`TARDANZA`).
- `F`: falta (`FALTA`).

La respuesta JSON conserva `estado` con su valor completo para compatibilidad,
y agrega `hora`, `estadoCodigo` y `estadoDescripcion`:

```json
[
  {
    "fecha": "2026-10-30",
    "hora": "07:30:45",
    "persona": "Ana Pérez",
    "tipo": "ESTUDIANTE",
    "grado": "5to",
    "seccion": "A",
    "estado": "PUNTUAL",
    "estadoCodigo": "P",
    "estadoDescripcion": "Presente - asistió puntual"
  }
]
```

El Excel organiza la asistencia como una matriz: `N°`, `Nombre completo`,
`Grado`, `Sección`, totales `P`, `T` y `F`, seguidos de una columna por cada
día laborable del periodo. Se excluyen sábados y domingos. Cada celda muestra
el código de estado y, cuando existe, la hora de ingreso en una segunda línea.
`P` tiene fondo claro, `T` amarillo y `F` rojo. Las columnas de numeración,
nombre, grado y sección quedan inmovilizadas al desplazarse por las fechas.
La lista de personas y sus datos proviene de los registros existentes; si una
persona no tiene asistencias en el periodo, se muestra con totales en cero y
celdas vacías. No se crean asistencias ni se requiere modificar la base de
datos para generar el archivo.

| Dato del reporte            | Respuesta JSON | Columna del Excel |
| --------------------------- | -------------- | ----------------- |
| Grado escolar de la persona | `grado`        | `Grado`           |
| Sección del estudiante      | `seccion`      | `Sección`         |

Para estudiantes, estos valores identifican de qué grado y sección son. Para
personal y para registros antiguos sin esos datos, el JSON devuelve `null` y
las celdas del Excel quedan vacías.

Enviar `fechaInicio` y `fechaFin` para establecer el periodo del reporte. Si no
se envían, el Excel usa desde la primera hasta la última fecha de los registros
encontrados. El reporte contiene registros almacenados; no genera
automáticamente filas de falta para personas que no registraron asistencia.

## Errores y experiencia de usuario

Las respuestas de error de NestJS incluyen `statusCode`, `message` y `error`.
`message` puede ser una cadena o una lista de mensajes:

```json
{
  "statusCode": 400,
  "message": "El DNI ya está registrado",
  "error": "Bad Request"
}
```

| HTTP  | Significado habitual                                                                |
| ----- | ----------------------------------------------------------------------------------- |
| `400` | Datos inválidos, DNI/código duplicado, cargo/tipo no permitido o archivo incorrecto |
| `404` | No existe la persona o el código consultado                                         |
| `409` | Ya existe asistencia para la persona y fecha escolar                                |
| `413` | El archivo excede el límite                                                         |

En carga masiva, presentar cada error por `fila`, `campo` y `mensaje`. No
limpiar el formulario ni informar éxito si la petición falla. No ejecutar la
importación automáticamente después de validar: debe haber confirmación
explícita de la persona usuaria.

## Consideraciones para la interfaz

- Mostrar grado/sección para estudiantes y cargo para personal.
- Enviar exactamente los valores de cargo indicados; se puede mostrar una
  etiqueta más amigable en el selector.
- Enviar el DNI como cadena, no como número.
- Usar `activo` como booleano y mostrarlo en pantalla como Habilitado o
  Deshabilitado.
- La auditoría todavía no identifica al usuario que ejecutó una acción.
