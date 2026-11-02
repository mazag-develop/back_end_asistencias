import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { ReportesService } from './reportes.service';

describe('ReportesService', () => {
  const asistencia = {
    personaId: 1,
    fechaEscolar: '2026-10-30',
    fechaHora: new Date('2026-10-30T12:30:45.000Z'),
    persona: {
      id: 1,
      nombres: 'Ana',
      apellidos: 'Pérez',
      tipo: 'ESTUDIANTE',
      grado: '5to',
      seccion: 'A',
    },
    estado: 'PUNTUAL',
  };

  function createService() {
    const prisma = {
      asistencia: {
        findMany: jest.fn().mockResolvedValue([asistencia]),
      },
      persona: {
        findMany: jest.fn().mockResolvedValue([asistencia.persona]),
      },
    } as unknown as PrismaService;

    return {
      prisma,
      service: new ReportesService(prisma),
    };
  }

  it('returns report rows in the frontend shape', async () => {
    const { service } = createService();

    await expect(service.getAsistencias({})).resolves.toEqual([
      {
        fecha: '2026-10-30',
        hora: '07:30:45',
        persona: 'Ana Pérez',
        personaId: 1,
        tipo: 'ESTUDIANTE',
        grado: '5to',
        seccion: 'A',
        estado: 'PUNTUAL',
        estadoCodigo: 'P',
        estadoDescripcion: 'Presente - asistió puntual',
      },
    ]);
  });

  it.each([
    ['PUNTUAL', 'P', 'Presente - asistió puntual'],
    ['TARDANZA', 'T', 'Tardanza'],
    ['FALTA', 'F', 'Falta'],
  ] as const)(
    'maps %s to report code %s',
    async (estado, estadoCodigo, estadoDescripcion) => {
      const { prisma, service } = createService();
      (prisma.asistencia.findMany as jest.Mock).mockResolvedValue([
        { ...asistencia, estado },
      ]);

      const [row] = await service.getAsistencias({});

      expect(row).toMatchObject({
        estado,
        estadoCodigo,
        estadoDescripcion,
      });
      expect(row.hora).toBe(estado === 'FALTA' ? '' : '07:30:45');
    },
  );

  it('generates a styled weekday attendance matrix and ignores weekends', async () => {
    const { prisma, service } = createService();
    (prisma.asistencia.findMany as jest.Mock).mockResolvedValue([
      asistencia,
      {
        ...asistencia,
        fechaEscolar: '2026-10-31',
        fechaHora: new Date('2026-10-31T12:45:00.000Z'),
        estado: 'TARDANZA',
      },
      {
        ...asistencia,
        fechaEscolar: '2026-11-02',
        fechaHora: new Date('2026-11-02T12:50:00.000Z'),
        estado: 'TARDANZA',
      },
    ]);
    (prisma.persona.findMany as jest.Mock).mockResolvedValue([
      asistencia.persona,
      {
        id: 2,
        nombres: 'Lucía',
        apellidos: 'Sin registros',
        tipo: 'ESTUDIANTE',
        grado: '4to',
        seccion: 'B',
      },
    ]);
    const bytes = await service.getExcelReport({
      fechaInicio: '2026-10-30',
      fechaFin: '2026-11-02',
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);

    const worksheet = workbook.getWorksheet('Asistencias');
    expect(worksheet?.getRow(1).values).toEqual([
      undefined,
      'N°',
      'Nombre completo',
      'Grado',
      'Sección',
      'P',
      'T',
      'F',
      'Vie 30/10',
      'Lun 02/11',
    ]);
    expect(worksheet?.getRow(2).values).toEqual([
      undefined,
      1,
      'Ana Pérez',
      '5to',
      'A',
      1,
      1,
      0,
      'P\n07:30:45',
      'T\n07:50:00',
    ]);
    expect(worksheet?.getRow(3).values).toEqual([
      undefined,
      2,
      'Lucía Sin registros',
      '4to',
      'B',
      0,
      0,
      0,
      '',
      '',
    ]);
    expect(worksheet?.getCell('H2').fill).toMatchObject({
      fgColor: { argb: 'FFEEF4F8' },
    });
    expect(worksheet?.getCell('I2').fill).toMatchObject({
      fgColor: { argb: 'FFE6E64C' },
    });
    expect(worksheet?.views[0]).toMatchObject({
      state: 'frozen',
      xSplit: 4,
      ySplit: 1,
    });
  });
});
