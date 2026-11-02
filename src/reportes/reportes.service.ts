import { Injectable } from '@nestjs/common';
import { EstadoAsistencia, Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { DateTime } from 'luxon';
import { construirFiltroAsistencia } from '../common/asistencia-where';
import { AsistenciaFiltrosQueryDto } from '../common/dto/asistencia-filtros-query.dto';
import { PrismaService } from '../prisma/prisma.service';

const ESTADOS_REPORTE: Record<
  EstadoAsistencia,
  { codigo: 'P' | 'T' | 'F'; descripcion: string }
> = {
  PUNTUAL: { codigo: 'P', descripcion: 'Presente - asistió puntual' },
  TARDANZA: { codigo: 'T', descripcion: 'Tardanza' },
  FALTA: { codigo: 'F', descripcion: 'Falta' },
};

@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAsistencias(query: AsistenciaFiltrosQueryDto) {
    const asistencias = await this.prisma.asistencia.findMany({
      where: construirFiltroAsistencia(query),
      include: { persona: true },
      orderBy: [{ fechaEscolar: 'desc' }, { fechaHora: 'desc' }],
    });

    return asistencias.map((asistencia) => {
      const estadoReporte = ESTADOS_REPORTE[asistencia.estado];
      return {
        fecha: asistencia.fechaEscolar,
        hora:
          asistencia.estado === 'FALTA'
            ? ''
            : DateTime.fromJSDate(asistencia.fechaHora, {
                zone: 'America/Lima',
              }).toFormat('HH:mm:ss'),
        persona: `${asistencia.persona.nombres} ${asistencia.persona.apellidos}`,
        personaId: asistencia.personaId,
        tipo: asistencia.persona.tipo,
        grado: asistencia.persona.grado ?? null,
        seccion: asistencia.persona.seccion ?? null,
        estado: asistencia.estado,
        estadoCodigo: estadoReporte.codigo,
        estadoDescripcion: estadoReporte.descripcion,
      };
    });
  }

  async getExcelReport(query: AsistenciaFiltrosQueryDto) {
    const rows = await this.getAsistencias(query);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Asistencias');
    const dates = this.getExcelDates(rows, query);
    const personWhere: Prisma.PersonaWhereInput = {};
    if (query.tipo) {
      personWhere.tipo = query.tipo;
    }
    if (query.codigo?.trim()) {
      personWhere.codigo = {
        contains: query.codigo.trim(),
        mode: 'insensitive',
      };
    }
    if (query.persona?.trim()) {
      personWhere.AND = query.persona
        .trim()
        .split(/\s+/)
        .map((term) => ({
          OR: [
            { nombres: { contains: term, mode: 'insensitive' } },
            { apellidos: { contains: term, mode: 'insensitive' } },
            { codigo: { contains: term, mode: 'insensitive' } },
          ],
        }));
    }
    const roster = await this.prisma.persona.findMany({
      where: personWhere,
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
    });
    const people = new Map<
      number,
      {
        persona: string;
        tipo: string;
        grado: string | null;
        seccion: string | null;
        asistencias: Map<string, (typeof rows)[number]>;
      }
    >();

    for (const row of rows) {
      if (!dates.some((date) => date.key === row.fecha)) {
        continue;
      }

      let person = people.get(row.personaId);
      if (!person) {
        person = {
          persona: row.persona,
          tipo: row.tipo,
          grado: row.grado,
          seccion: row.seccion,
          asistencias: new Map(),
        };
        people.set(row.personaId, person);
      }
      person.asistencias.set(row.fecha, row);
    }

    const matchingAttendanceIds = new Set(rows.map((row) => row.personaId));
    for (const person of roster) {
      if (query.estado && !matchingAttendanceIds.has(person.id)) {
        continue;
      }
      if (!people.has(person.id)) {
        people.set(person.id, {
          persona: `${person.nombres} ${person.apellidos}`,
          tipo: person.tipo,
          grado: person.grado,
          seccion: person.seccion,
          asistencias: new Map(),
        });
      }
    }

    const sortedPeople = [...people.values()].sort((a, b) =>
      a.persona.localeCompare(b.persona, 'es'),
    );
    const firstDateColumn = 8;
    worksheet.columns = [
      { header: 'N°', key: 'numero', width: 6 },
      { header: 'Nombre completo', key: 'persona', width: 34 },
      { header: 'Grado', key: 'grado', width: 12 },
      { header: 'Sección', key: 'seccion', width: 12 },
      { header: 'P', key: 'puntualidades', width: 6 },
      { header: 'T', key: 'tardanzas', width: 6 },
      { header: 'F', key: 'faltas', width: 6 },
      ...dates.map((date) => ({
        header: date.header,
        key: date.key,
        width: 13,
      })),
    ];

    sortedPeople.forEach((person, index) => {
      const totals = { P: 0, T: 0, F: 0 };
      for (const record of person.asistencias.values()) {
        totals[record.estadoCodigo] += 1;
      }

      const row = worksheet.addRow([
        index + 1,
        person.persona,
        person.grado ?? '',
        person.seccion ?? '',
        totals.P,
        totals.T,
        totals.F,
        ...dates.map((date) => {
          const attendance = person.asistencias.get(date.key);
          return attendance
            ? attendance.hora
              ? `${attendance.estadoCodigo}\n${attendance.hora}`
              : attendance.estadoCodigo
            : '';
        }),
      ]);
      row.height = 30;

      dates.forEach((date, index) => {
        const attendance = person.asistencias.get(date.key);
        if (!attendance) {
          return;
        }

        const cell = row.getCell(firstDateColumn + index);
        cell.alignment = {
          horizontal: 'center',
          vertical: 'middle',
          wrapText: true,
        };
        cell.font = {
          bold: attendance.estadoCodigo === 'F',
          color: {
            argb: attendance.estadoCodigo === 'F' ? 'FFFFFFFF' : 'FF000000',
          },
        };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: {
            argb:
              attendance.estadoCodigo === 'T'
                ? 'FFE6E64C'
                : attendance.estadoCodigo === 'F'
                  ? 'FFE61C24'
                  : 'FFEEF4F8',
          },
        };
      });

      row.eachCell((cell, columnNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFB0C0D0' } },
          left: { style: 'thin', color: { argb: 'FFB0C0D0' } },
          bottom: { style: 'thin', color: { argb: 'FFB0C0D0' } },
          right: { style: 'thin', color: { argb: 'FFB0C0D0' } },
        };
        if (columnNumber <= 7) {
          cell.alignment = {
            horizontal: columnNumber === 2 ? 'left' : 'center',
            vertical: 'middle',
          };
        }
        if (columnNumber >= 5 && columnNumber <= 7) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE8EFF5' },
          };
        }
      });
    });

    const header = worksheet.getRow(1);
    header.height = 24;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FF000000' } };
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD0DCE8' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFB0C0D0' } },
        left: { style: 'thin', color: { argb: 'FFB0C0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFB0C0D0' } },
        right: { style: 'thin', color: { argb: 'FFB0C0D0' } },
      };
    });

    worksheet.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }];
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columns.length },
    };

    return workbook.xlsx.writeBuffer();
  }

  private getExcelDates(
    rows: Awaited<ReturnType<ReportesService['getAsistencias']>>,
    query: AsistenciaFiltrosQueryDto,
  ): { key: string; header: string }[] {
    const recordDates = rows.map((row) => row.fecha).sort();
    const start = query.fechaInicio ?? recordDates[0];
    const end = query.fechaFin ?? recordDates.at(-1);
    if (!start || !end) {
      return [];
    }

    const dates: { key: string; header: string }[] = [];
    const current = DateTime.fromISO(start, { zone: 'UTC' });
    const last = DateTime.fromISO(end, { zone: 'UTC' });
    if (
      !current.isValid ||
      !last.isValid ||
      current.toMillis() > last.toMillis()
    ) {
      return dates;
    }

    for (
      let date = current;
      date.toMillis() <= last.toMillis();
      date = date.plus({ days: 1 })
    ) {
      if (date.weekday > 5) {
        continue;
      }
      dates.push({
        key: date.toFormat('yyyy-MM-dd'),
        header: `${date
          .setLocale('es')
          .toFormat('ccc')
          .replace('.', '')
          .replace(/^./, (letter) =>
            letter.toLocaleUpperCase(),
          )} ${date.toFormat('dd/MM')}`,
      });
    }
    return dates;
  }
}
