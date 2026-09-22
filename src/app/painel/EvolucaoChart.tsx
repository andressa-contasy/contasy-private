'use client';

import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import type { ChartOptions, Plugin } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { nomeMes } from '../../lib/painel';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

const ouro = '#d8b362';
const um = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Com um único mês não há linha para desenhar: escreve o valor acima do ponto
const rotuloUnico: Plugin<'line'> = {
  id: 'rotuloUnico',
  afterDatasetsDraw(chart) {
    const pontos = chart.getDatasetMeta(0).data;
    if (pontos.length !== 1) return;
    const valor = Number(chart.data.datasets[0].data[0]);
    const { ctx, canvas } = chart;
    ctx.save();
    ctx.fillStyle = '#f3e3b3';
    ctx.font = `700 15px ${getComputedStyle(canvas).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${um.format(valor)}%`, pontos[0].x, pontos[0].y - 16);
    ctx.restore();
  },
};

export default function EvolucaoChart({ pontos }: { pontos: { mes: string; carga: number }[] }) {
  const valores = pontos.map((p) => p.carga);
  const minimo = Math.floor(Math.min(...valores) * 2) / 2;
  let maximo = Math.ceil(Math.max(...valores) * 2) / 2;
  let piso = minimo;
  // Todos os valores iguais (ou um só mês): abre uma faixa em volta para o ponto ficar no meio
  if (maximo <= piso) {
    piso -= 0.5;
    maximo += 0.5;
  }
  const amplitude = maximo - piso;

  const opcoes: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // sem animação, para a captura do PDF sair completa
    layout: { padding: { top: 8, right: 8 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (item) => ` Carga efetiva: ${um.format(Number(item.raw))}%` },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: '#94a3b8', font: { size: 12 } },
      },
      y: {
        min: piso,
        max: maximo,
        grid: { color: 'rgba(148, 163, 184, 0.12)' },
        border: { display: false },
        ticks: {
          color: '#94a3b8',
          font: { size: 12 },
          padding: 8,
          stepSize: amplitude <= 5 ? 0.5 : undefined,
          callback: (valor) => um.format(Number(valor)),
        },
      },
    },
  };

  return (
    <Line
      options={opcoes}
      plugins={[rotuloUnico]}
      data={{
        labels: pontos.map((p) => nomeMes(p.mes)),
        datasets: [
          {
            data: valores,
            borderColor: ouro,
            borderWidth: 2.5,
            tension: 0.4,
            fill: true,
            clip: false, // não corta os pontos que ficam na borda do gráfico
            backgroundColor: (contexto) => {
              const { chart } = contexto;
              if (!chart.chartArea) return 'rgba(216, 179, 98, 0.12)';
              const gradiente = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
              gradiente.addColorStop(0, 'rgba(216, 179, 98, 0.28)');
              gradiente.addColorStop(1, 'rgba(216, 179, 98, 0)');
              return gradiente;
            },
            pointBackgroundColor: '#f3e3b3',
            pointBorderColor: ouro,
            pointBorderWidth: 1.5,
            pointRadius: 4.5,
            pointHoverRadius: 6,
          },
        ],
      }}
    />
  );
}
