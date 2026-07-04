'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'

type Animal = {
  id: string
  nome: string | null
  brinco: string | null
  sisbov: string | null
  sexo: string | null
  raca: string | null
  data_nascimento: string | null
  peso_entrada_kg: number | null
  foto_url: string | null
  ultimo_cio: string | null
  prenhez: string | null
  data_parto_previsto: string | null
  observacoes: string | null
  status: string
  lotes_animais: { nome: string; especie: string } | null
}

type Evento = {
  id: string
  tipo: string
  data: string
  descricao: string | null
  peso_medio_kg: number | null
  medicamento: string | null
  dose: string | null
  observacoes: string | null
}

const TIPO_EMOJI: Record<string, string> = {
  vacinacao:   '💉',
  pesagem:     '⚖️',
  tratamento:  '🩺',
  reproducao:  '🔬',
  parto:       '🐄',
  venda:       '💰',
  morte:       '❌',
  outro:       '📋',
}

function calcularIdade(dataNascimento: string): string {
  const nasc  = new Date(dataNascimento)
  const hoje  = new Date()
  const meses = (hoje.getFullYear() - nasc.getFullYear()) * 12 + (hoje.getMonth() - nasc.getMonth())
  if (meses < 1)  return 'Recém-nascido'
  if (meses < 12) return `${meses} meses`
  const anos = Math.floor(meses / 12)
  const m    = meses % 12
  return m > 0 ? `${anos} anos e ${m} meses` : `${anos} anos`
}

function formatarData(data: string): string {
  return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default function AnimalPage() {
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const id       = params.id as string

  const [animal,   setAnimal]   = useState<Animal | null>(null)
  const [eventos,  setEventos]  = useState<Evento[]>([])
  const [loading,  setLoading]  = useState(true)
  const [abaAtiva, setAbaAtiva] = useState<'perfil' | 'historico'>('perfil')
  const [novoEvento, setNovoEvento] = useState(false)
  const [tipoEvento, setTipoEvento] = useState('vacinacao')
  const [dataEvento, setDataEvento] = useState(new Date().toISOString().split('T')[0])
  const [descEvento, setDescEvento] = useState('')
  const [pesoEvento, setPesoEvento] = useState('')
  const [medEvento,  setMedEvento]  = useState('')
  const [doseEvento, setDoseEvento] = useState('')
  const [salvando,   setSalvando]   = useState(false)

  useEffect(() => { carregarDados() }, [id])

  async function carregarDados() {
    const { data: animalData } = await supabase
      .from('animais')
      .select('*, lotes_animais(nome, especie)')
      .eq('id', id).single()
    setAnimal(animalData as any)

    const { data: eventosData } = await supabase
      .from('eventos_manejo')
      .select('id, tipo, data, descricao, peso_medio_kg, medicamento, dose, observacoes')
      .eq('animal_id', id)
      .order('data', { ascending: false })
    setEventos(eventosData ?? [])

    setLoading(false)
  }

  async function salvarEvento() {
    setSalvando(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: faz } = await supabase
      .from('fazendas').select('id').eq('owner_id', user.id).single()
    if (!faz) return

    await supabase.from('eventos_manejo').insert({
      fazenda_id:    faz.id,
      animal_id:     id,
      tipo:          tipoEvento,
      data:          dataEvento,
      descricao:     descEvento || null,
      peso_medio_kg: pesoEvento ? Number(pesoEvento) : null,
      medicamento:   medEvento  || null,
      dose:          doseEvento || null,
    })

    setNovoEvento(false)
    setDescEvento('')
    setPesoEvento('')
    setMedEvento('')
    setDoseEvento('')
    setSalvando(false)
    carregarDados()
  }

  if (loading) return (
    <div className="min-h-screen bg-[#F5F2EB] flex items-center justify-center">
      <p className="text-sm text-stone-500">Carregando...</p>
    </div>
  )

  if (!animal) return (
    <div className="min-h-screen bg-[#F5F2EB] flex items-center justify-center">
      <p className="text-sm text-stone-500">Animal não encontrado.</p>
    </div>
  )

  const prenhez = animal.prenhez === 'positivo' ? '✅ Positivo'
    : animal.prenhez === 'negativo' ? '❌ Negativo'
    : animal.prenhez === 'aguardando' ? '⏳ Aguardando' : null

  return (
    <div className="min-h-screen bg-[#F5F2EB]">

      {/* Header com foto */}
      <div className="relative">
        <div className="h-52 bg-amber-100 overflow-hidden">
          {animal.foto_url ? (
            <img src={animal.foto_url} alt={animal.nome ?? 'Animal'} className="w-full h-full object-cover"/>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-8xl opacity-30">{animal.sexo === 'M' ? '🐂' : '🐄'}</span>
            </div>
          )}
          {/* Overlay escuro no topo */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent"/>
        </div>

        {/* Botão voltar */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 left-4 bg-black/30 hover:bg-black/50 text-white rounded-full w-9 h-9 flex items-center justify-center transition"
        >
          ←
        </button>

        {/* Badge sexo */}
        <span className={`absolute top-4 right-4 text-xs font-bold px-2.5 py-1 rounded-full
          ${animal.sexo === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
          {animal.sexo === 'M' ? '♂ Macho' : '♀ Fêmea'}
        </span>
      </div>

      {/* Identificação */}
      <div className="bg-white px-5 py-4 border-b border-stone-100">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-900">
              {animal.nome ?? animal.brinco ?? 'Sem identificação'}
            </h1>
            {animal.brinco && animal.nome && (
              <p className="text-sm text-stone-400">Brinco #{animal.brinco}</p>
            )}
            {animal.raca && (
              <p className="text-sm text-[#5C7A45] font-medium mt-0.5">{animal.raca}</p>
            )}
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full mt-1
            ${animal.status === 'ativo' ? 'bg-green-100 text-green-700' : 'bg-stone-100 text-stone-500'}`}>
            {animal.status}
          </span>
        </div>
      </div>

      {/* Abas */}
      <div className="bg-white border-b border-stone-200 flex">
        {(['perfil', 'historico'] as const).map(aba => (
          <button
            key={aba}
            onClick={() => setAbaAtiva(aba)}
            className={`flex-1 py-3 text-sm font-medium transition
              ${abaAtiva === aba
                ? 'text-[#2D5016] border-b-2 border-[#2D5016]'
                : 'text-stone-400 hover:text-stone-600'}`}
          >
            {aba === 'perfil' ? '📋 Perfil' : `📅 Histórico (${eventos.length})`}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto px-4 py-5">

        {/* ABA PERFIL */}
        {abaAtiva === 'perfil' && (
          <div className="space-y-4">

            {/* Dados básicos */}
            <section className="bg-white rounded-2xl border border-stone-200 divide-y divide-stone-100">
              {animal.data_nascimento && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <p className="text-sm text-stone-500">Data de nascimento</p>
                  <p className="text-sm font-medium text-stone-800">{formatarData(animal.data_nascimento)}</p>
                </div>
              )}
              {animal.data_nascimento && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <p className="text-sm text-stone-500">Idade</p>
                  <p className="text-sm font-medium text-amber-600">{calcularIdade(animal.data_nascimento)}</p>
                </div>
              )}
              {animal.peso_entrada_kg && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <p className="text-sm text-stone-500">Peso de entrada</p>
                  <p className="text-sm font-medium text-stone-800">{animal.peso_entrada_kg} kg</p>
                </div>
              )}
              {animal.sisbov && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <p className="text-sm text-stone-500">SISBOV</p>
                  <p className="text-sm font-medium text-stone-800">{animal.sisbov}</p>
                </div>
              )}
              {animal.lotes_animais && (
                <div className="flex justify-between items-center px-5 py-3.5">
                  <p className="text-sm text-stone-500">Lote</p>
                  <p className="text-sm font-medium text-stone-800">{animal.lotes_animais.nome}</p>
                </div>
              )}
            </section>

            {/* Reprodução — só fêmeas */}
            {animal.sexo === 'F' && (
              <section className="bg-white rounded-2xl border border-stone-200">
                <div className="px-5 py-3 border-b border-stone-100">
                  <p className="text-sm font-semibold text-stone-700">🔬 Reprodução</p>
                </div>
                <div className="divide-y divide-stone-100">
                  {animal.ultimo_cio && (
                    <div className="flex justify-between items-center px-5 py-3.5">
                      <p className="text-sm text-stone-500">Último cio</p>
                      <p className="text-sm font-medium text-stone-800">{formatarData(animal.ultimo_cio)}</p>
                    </div>
                  )}
                  {prenhez && (
                    <div className="flex justify-between items-center px-5 py-3.5">
                      <p className="text-sm text-stone-500">Prenhez</p>
                      <p className="text-sm font-medium text-stone-800">{prenhez}</p>
                    </div>
                  )}
                  {animal.data_parto_previsto && (
                    <div className="flex justify-between items-center px-5 py-3.5">
                      <p className="text-sm text-stone-500">Previsão de parto</p>
                      <p className="text-sm font-medium text-amber-600">{formatarData(animal.data_parto_previsto)}</p>
                    </div>
                  )}
                  {!animal.ultimo_cio && !prenhez && !animal.data_parto_previsto && (
                    <p className="px-5 py-4 text-sm text-stone-400">Nenhum dado reprodutivo registrado.</p>
                  )}
                </div>
              </section>
            )}

            {/* Observações */}
            {animal.observacoes && (
              <section className="bg-white rounded-2xl border border-stone-200 p-5">
                <p className="text-sm font-semibold text-stone-700 mb-2">📝 Observações</p>
                <p className="text-sm text-stone-600 leading-relaxed">{animal.observacoes}</p>
              </section>
            )}
          </div>
        )}

        {/* ABA HISTÓRICO */}
        {abaAtiva === 'historico' && (
          <div className="space-y-4">

            {/* Botão novo evento */}
            <button
              onClick={() => setNovoEvento(!novoEvento)}
              className="w-full rounded-xl bg-[#2D5016] text-white text-sm font-medium py-3 hover:bg-[#3a6620] transition"
            >
              + Registrar evento
            </button>

            {/* Form novo evento */}
            {novoEvento && (
              <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
                <p className="text-sm font-semibold text-stone-700">Novo evento</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-stone-600">Tipo</label>
                    <select
                      value={tipoEvento}
                      onChange={e => setTipoEvento(e.target.value)}
                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"
                    >
                      <option value="vacinacao">💉 Vacinação</option>
                      <option value="pesagem">⚖️ Pesagem</option>
                      <option value="tratamento">🩺 Tratamento</option>
                      <option value="reproducao">🔬 Reprodução</option>
                      <option value="parto">🐄 Parto</option>
                      <option value="outro">📋 Outro</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-stone-600">Data</label>
                    <input
                      type="date"
                      value={dataEvento}
                      onChange={e => setDataEvento(e.target.value)}
                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-stone-600">Descrição</label>
                  <input
                    type="text"
                    placeholder="Ex: Vacina febre aftosa, dose 2ml..."
                    value={descEvento}
                    onChange={e => setDescEvento(e.target.value)}
                    className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"
                  />
                </div>

                {tipoEvento === 'pesagem' && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-stone-600">Peso (kg)</label>
                    <input
                      type="number" step="0.1" placeholder="Ex: 420"
                      value={pesoEvento}
                      onChange={e => setPesoEvento(e.target.value)}
                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"
                    />
                  </div>
                )}

                {(tipoEvento === 'vacinacao' || tipoEvento === 'tratamento') && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-stone-600">Medicamento</label>
                      <input
                        type="text" placeholder="Nome do produto"
                        value={medEvento}
                        onChange={e => setMedEvento(e.target.value)}
                        className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-stone-600">Dose</label>
                      <input
                        type="text" placeholder="Ex: 2ml"
                        value={doseEvento}
                        onChange={e => setDoseEvento(e.target.value)}
                        className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#2D5016]/25 bg-white"
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => setNovoEvento(false)}
                    className="flex-1 rounded-lg border border-stone-300 text-stone-600 text-sm py-2.5 hover:bg-stone-50 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={salvarEvento}
                    disabled={salvando}
                    className="flex-1 rounded-lg bg-[#2D5016] text-white text-sm py-2.5 hover:bg-[#3a6620] transition disabled:opacity-55"
                  >
                    {salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            )}

            {/* Lista de eventos */}
            {eventos.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-stone-300 p-8 text-center">
                <p className="text-sm text-stone-400">Nenhum evento registrado ainda.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {eventos.map(ev => (
                  <div key={ev.id} className="bg-white rounded-xl border border-stone-200 px-4 py-3.5 flex gap-3">
                    <span className="text-xl mt-0.5">{TIPO_EMOJI[ev.tipo] ?? '📋'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-stone-800 capitalize">{ev.tipo}</p>
                        <p className="text-xs text-stone-400 shrink-0">{formatarData(ev.data)}</p>
                      </div>
                      {ev.descricao && (
                        <p className="text-sm text-stone-500 mt-0.5">{ev.descricao}</p>
                      )}
                      {ev.peso_medio_kg && (
                        <p className="text-xs text-amber-600 mt-0.5 font-medium">⚖️ {ev.peso_medio_kg} kg</p>
                      )}
                      {ev.medicamento && (
                        <p className="text-xs text-stone-500 mt-0.5">💊 {ev.medicamento}{ev.dose ? ` — ${ev.dose}` : ''}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}