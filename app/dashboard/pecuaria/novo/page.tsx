'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const schema = z.object({
  nome:            z.string().optional(),
  brinco:          z.string().optional(),
  sexo:            z.enum(['M', 'F']),
  raca:            z.string().optional(),
  data_nascimento: z.string().optional(),
  peso_entrada_kg: z.coerce.number().positive().optional(),
  ultimo_cio:      z.string().optional(),
  prenhez:         z.enum(['positivo', 'negativo', 'aguardando']).optional(),
  data_parto_previsto: z.string().optional(),
  observacoes:     z.string().optional(),
})

type FormData = z.infer<typeof schema>

const inputClass = 'w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-[#2D5016]/25 focus:border-[#2D5016] bg-white'
const labelClass = 'text-sm font-medium text-stone-700'

export default function NovoAnimalPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [fotoFile,    setFotoFile]    = useState<File | null>(null)
  const [carregando,  setCarregando]  = useState(false)
  const [erro,        setErro]        = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { sexo: 'F' },
  })

  const sexo    = watch('sexo')
  const prenhez = watch('prenhez')

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setFotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function onSubmit(dados: FormData) {
    setCarregando(true)
    setErro(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: faz } = await supabase
      .from('fazendas').select('id').eq('owner_id', user.id).single()
    if (!faz) { router.push('/onboarding'); return }

    let foto_url: string | null = null

    // Upload da foto se houver
    if (fotoFile) {
      const ext      = fotoFile.name.split('.').pop()
      const caminho  = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('animais').upload(caminho, fotoFile, { upsert: true })

      if (uploadError) {
        setErro('Erro ao enviar a foto. Tente novamente.')
        setCarregando(false)
        return
      }

      const { data: urlData } = supabase.storage.from('animais').getPublicUrl(caminho)
      foto_url = urlData.publicUrl
    }

    const { error } = await supabase.from('animais').insert({
      fazenda_id:          faz.id,
      nome:                dados.nome     || null,
      brinco:              dados.brinco   || null,
      sexo:                dados.sexo,
      raca:                dados.raca     || null,
      data_nascimento:     dados.data_nascimento || null,
      peso_entrada_kg:     dados.peso_entrada_kg || null,
      ultimo_cio:          dados.ultimo_cio || null,
      prenhez:             dados.prenhez  || null,
      data_parto_previsto: dados.data_parto_previsto || null,
      observacoes:         dados.observacoes || null,
      foto_url,
      status: 'ativo',
    })

    if (error) {
      setErro('Erro ao salvar o animal. Tente novamente.')
      setCarregando(false)
      return
    }

    router.push('/dashboard/pecuaria')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#F5F2EB]">

      <header className="bg-[#2D5016] px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-white/70 hover:text-white transition">←</button>
        <div>
          <p className="text-white font-semibold text-sm leading-none">Novo Animal</p>
          <p className="text-white/60 text-xs mt-0.5">Preencha os dados do animal</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">

          {/* Foto */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-32 h-32 rounded-2xl bg-amber-50 border-2 border-dashed border-amber-300 overflow-hidden flex items-center justify-center relative">
              {fotoPreview ? (
                <img src={fotoPreview} alt="Preview" className="w-full h-full object-cover"/>
              ) : (
                <div className="text-center">
                  <p className="text-4xl">{sexo === 'M' ? '🐂' : '🐄'}</p>
                  <p className="text-xs text-stone-400 mt-1">Sem foto</p>
                </div>
              )}
            </div>
            <label className="cursor-pointer bg-white border border-stone-300 text-stone-700 text-xs font-medium px-4 py-2 rounded-lg hover:bg-stone-50 transition">
              📷 {fotoPreview ? 'Trocar foto' : 'Adicionar foto'}
              <input type="file" accept="image/*" className="hidden" onChange={handleFoto}/>
            </label>
          </div>

          {/* Identificação */}
          <section className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-stone-700">Identificação</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Nome</label>
                <input type="text" placeholder="Ex: Mimosa" className={inputClass} {...register('nome')}/>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Brinco / Nº</label>
                <input type="text" placeholder="Ex: 0042" className={inputClass} {...register('brinco')}/>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Sexo *</label>
              <div className="grid grid-cols-2 gap-2">
                {[{ v: 'F', l: '🐄 Fêmea' }, { v: 'M', l: '🐂 Macho' }].map(({ v, l }) => (
                  <label key={v} className={`flex items-center justify-center gap-2 rounded-lg border-2 py-2.5 cursor-pointer text-sm font-medium transition
                    ${sexo === v ? 'border-[#2D5016] bg-[#2D5016]/5 text-[#2D5016]' : 'border-stone-200 text-stone-500'}`}>
                    <input type="radio" value={v} className="hidden" {...register('sexo')}/>
                    {l}
                  </label>
                ))}
              </div>
              {errors.sexo && <p className="text-xs text-red-600">{errors.sexo.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Raça</label>
              <input type="text" placeholder="Ex: Nelore, Angus, Girolando..." className={inputClass} {...register('raca')}/>
            </div>
          </section>

          {/* Nascimento e peso */}
          <section className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-stone-700">Nascimento e Peso</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Data de nascimento</label>
                <input type="date" className={inputClass} {...register('data_nascimento')}/>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Peso entrada (kg)</label>
                <input type="number" step="0.1" placeholder="Ex: 380" className={inputClass} {...register('peso_entrada_kg')}/>
              </div>
            </div>
          </section>

          {/* Reprodução — só para fêmeas */}
          {sexo === 'F' && (
            <section className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-stone-700">Reprodução</h2>

              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Último cio</label>
                <input type="date" className={inputClass} {...register('ultimo_cio')}/>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelClass}>Prenhez</label>
                <select className={inputClass} {...register('prenhez')}>
                  <option value="">Não informado</option>
                  <option value="positivo">Positivo ✅</option>
                  <option value="negativo">Negativo ❌</option>
                  <option value="aguardando">Aguardando diagnóstico</option>
                </select>
              </div>

              {prenhez === 'positivo' && (
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Previsão de parto</label>
                  <input type="date" className={inputClass} {...register('data_parto_previsto')}/>
                </div>
              )}
            </section>
          )}

          {/* Observações */}
          <section className="bg-white rounded-2xl border border-stone-200 p-5">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Observações</label>
              <textarea
                rows={3}
                placeholder="Anotações gerais sobre o animal..."
                className={inputClass + ' resize-none'}
                {...register('observacoes')}
              />
            </div>
          </section>

          {erro && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{erro}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-xl bg-[#2D5016] text-white text-sm font-medium py-3
              transition hover:bg-[#3a6620] active:scale-[.98]
              disabled:opacity-55 disabled:cursor-not-allowed"
          >
            {carregando ? 'Salvando...' : 'Salvar animal'}
          </button>

        </form>
      </main>
    </div>
  )
}