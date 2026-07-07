'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Profile = {
  nome:       string
  telefone:   string | null
  avatar_url: string | null
}

export default function PerfilPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [profile,    setProfile]    = useState<Profile>({ nome: '', telefone: null, avatar_url: null })
  const [email,      setEmail]      = useState('')
  const [loading,    setLoading]    = useState(true)
  const [salvando,   setSalvando]   = useState(false)
  const [erro,       setErro]       = useState<string | null>(null)
  const [sucesso,    setSucesso]    = useState(false)
  const [fotoPreview, setFotoPreview] = useState<string | null>(null)
  const [fotoFile,    setFotoFile]    = useState<File | null>(null)
  const [userId,     setUserId]     = useState<string | null>(null)

  useEffect(() => { carregarPerfil() }, [])

  async function carregarPerfil() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    setUserId(user.id)
    setEmail(user.email ?? '')

    const { data } = await supabase
      .from('profiles')
      .select('nome, telefone, avatar_url')
      .eq('id', user.id)
      .single()

    if (data) {
      setProfile(data)
      setFotoPreview(data.avatar_url ?? null)
    }
    setLoading(false)
  }

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setFotoPreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  async function salvar() {
    if (!userId) return
    setSalvando(true)
    setErro(null)
    setSucesso(false)

    let avatar_url = profile.avatar_url

    // Upload de nova foto se selecionada
    if (fotoFile) {
      const ext    = fotoFile.name.split('.').pop()
      const path   = `avatars/${userId}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('animais')
        .upload(path, fotoFile, { upsert: true })

      if (upErr) {
        setErro('Erro ao enviar a foto. Tente novamente.')
        setSalvando(false)
        return
      }

      const { data: urlData } = supabase.storage.from('animais').getPublicUrl(path)
      avatar_url = urlData.publicUrl
    }

    const { error } = await supabase.from('profiles').update({
      nome:       profile.nome,
      telefone:   profile.telefone || null,
      avatar_url,
    }).eq('id', userId)

    if (error) {
      setErro('Erro ao salvar. Tente novamente.')
      setSalvando(false)
      return
    }

    setSucesso(true)
    setSalvando(false)
    setTimeout(() => setSucesso(false), 3000)
  }

  const inputCls = 'w-full rounded-lg border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-[#2D5016]/25 focus:border-[#2D5016] bg-white'

  if (loading) return (
    <div className="min-h-screen bg-[#F5F2EB] flex items-center justify-center">
      <p className="text-sm text-stone-500">Carregando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F5F2EB]">

      <header className="bg-[#2D5016] px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-white/70 hover:text-white transition">←</button>
        <div>
          <p className="text-white font-semibold text-sm leading-none">Meu perfil</p>
          <p className="text-white/60 text-xs mt-0.5">Dados pessoais</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Foto */}
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="relative">
            {fotoPreview ? (
              <img src={fotoPreview} alt="Avatar" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"/>
            ) : (
              <div className="w-24 h-24 rounded-full bg-[#2D5016]/20 border-4 border-white shadow-md flex items-center justify-center">
                <span className="text-4xl font-bold text-[#2D5016]">{profile.nome?.[0]?.toUpperCase() ?? '?'}</span>
              </div>
            )}
          </div>
          <label className="cursor-pointer bg-white border border-stone-300 text-stone-700 text-xs font-medium px-4 py-2 rounded-lg hover:bg-stone-50 transition">
            📷 {fotoPreview ? 'Trocar foto' : 'Adicionar foto'}
            <input type="file" accept="image/*" className="hidden" onChange={handleFoto}/>
          </label>
        </div>

        {/* Dados pessoais */}
        <section className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-stone-700">Dados pessoais</h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">Nome completo</label>
            <input
              type="text"
              className={inputCls}
              value={profile.nome}
              onChange={e => setProfile(p => ({ ...p, nome: e.target.value }))}
              placeholder="Seu nome completo"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">Telefone / WhatsApp</label>
            <input
              type="tel"
              className={inputCls}
              value={profile.telefone ?? ''}
              onChange={e => setProfile(p => ({ ...p, telefone: e.target.value }))}
              placeholder="Ex: (51) 99999-9999"
            />
          </div>
        </section>

        {/* Conta */}
        <section className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-stone-700">Conta</h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">E-mail</label>
            <input
              type="email"
              className={inputCls + ' bg-stone-50 text-stone-400 cursor-not-allowed'}
              value={email}
              disabled
            />
            <p className="text-xs text-stone-400">O e-mail não pode ser alterado por aqui.</p>
          </div>

          <a
            href="/auth/recuperar"
            className="inline-block text-sm text-[#2D5016] font-medium hover:underline"
          >
            🔒 Alterar senha
          </a>
        </section>

        {erro && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{erro}</p>
          </div>
        )}

        {sucesso && (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
            <p className="text-sm text-green-700">✅ Perfil atualizado com sucesso!</p>
          </div>
        )}

        <button
          onClick={salvar}
          disabled={salvando}
          className="w-full rounded-xl bg-[#2D5016] text-white text-sm font-medium py-3
            transition hover:bg-[#3a6620] active:scale-[.98]
            disabled:opacity-55 disabled:cursor-not-allowed"
        >
          {salvando ? 'Salvando...' : 'Salvar alterações'}
        </button>

      </main>
    </div>
  )
}