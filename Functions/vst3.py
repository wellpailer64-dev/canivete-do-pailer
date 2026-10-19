"""
vst3.py — carregador PRÓPRIO de plugins de áudio VST3 do KANIVETE (Python puro + ctypes; sem compilador e sem
biblioteca de terceiros). As interfaces seguem os cabeçalhos oficiais da Steinberg (vst3_pluginterfaces, licença MIT
desde 2025; cópia de referência em D:/kanivete_testes/vst/sdk) — identificadores (IID) e ordem dos métodos de lá.

O plugin VST3 é uma DLL com objetos "COM": cada objeto é um ponteiro para uma tabela de funções. Aqui:
- chamamos as funções do plugin pela posição na tabela (_chamar);
- e montamos em Python os objetos que o PLUGIN chama de volta (o "anfitrião": IHostApplication, IComponentHandler,
  IBStream para salvar/ler o ajuste, IParameterChanges para mandar mudanças de parâmetro ao processador, IMessage/
  IAttributeList para o processador conversar com o controlador, IPlugFrame para a janela do plugin).

Uso:
    lista = varrer()                                   # plugins instalados (C:\\Program Files\\Common Files\\VST3)
    p = Plugin(caminho); p.carregar(48000)             # processador + controlador
    p.parametros()                                     # [{id, nome, unidade, passos, valor 0..1, padrao}]
    p.definir(id, 0.3); saida = p.processar(audio)     # audio: float32 [canais, amostras]
    estado = p.estado(); p.restaurar(estado)           # bytes (vai para o projeto)
    p.abrir_janela()                                   # a janela do próprio plugin (linha de mensagens própria)
"""
import ctypes
import os
import struct
import threading
import uuid
from ctypes import (POINTER, WINFUNCTYPE, Structure, byref, c_char, c_char_p, c_double, c_float, c_int16, c_int32,
                    c_int64, c_uint32, c_uint64, c_ubyte, c_void_p, c_wchar, cast)

import numpy as np

# ───────────────────────── identificadores (DECLARE_CLASS_IID) ─────────────────────────
def _iid(l1, l2, l3, l4):
    """INLINE_UID no Windows (COM_COMPATIBLE): o mesmo layout de um GUID."""
    return uuid.UUID(f"{l1:08x}-{l2 >> 16:04x}-{l2 & 0xFFFF:04x}-{l3:08x}{l4:08x}").bytes_le


IID = {
    "FUnknown": _iid(0x00000000, 0x00000000, 0xC0000000, 0x00000046),
    "IPluginFactory": _iid(0x7A4D811C, 0x52114A1F, 0xAED9D2EE, 0x0B43BF9F),
    "IPluginFactory2": _iid(0x0007B650, 0xF24B4C0B, 0xA464EDB9, 0xF00B2ABB),
    "IPluginBase": _iid(0x22888DDB, 0x156E45AE, 0x8358B348, 0x08190625),
    "IComponent": _iid(0xE831FF31, 0xF2D54301, 0x928EBBEE, 0x25697802),
    "IAudioProcessor": _iid(0x42043F99, 0xB7DA453C, 0xA569E79D, 0x9AAEC33D),
    "IEditController": _iid(0xDCD7BBE3, 0x7742448D, 0xA874AACC, 0x979C759E),
    "IConnectionPoint": _iid(0x70A4156F, 0x6E6E4026, 0x989148BF, 0xAA60D8D1),
    "IComponentHandler": _iid(0x93A0BEA3, 0x0BD045DB, 0x8E890B0C, 0xC1E46AC6),
    "IHostApplication": _iid(0x58E595CC, 0xDB2D4969, 0x8B6AAF8C, 0x36A664E5),
    "IBStream": _iid(0xC3BF6EA2, 0x30994752, 0x9B6BF990, 0x1EE33E9B),
    "IParameterChanges": _iid(0xA4779663, 0x0BB64A56, 0xB44384A8, 0x466FEB9D),
    "IParamValueQueue": _iid(0x01263A18, 0xED074F6F, 0x98C9D356, 0x4686F9BA),
    "IPlugView": _iid(0x5BC32507, 0xD06049EA, 0xA6151B52, 0x2B755B29),
    "IPlugFrame": _iid(0x367FAF01, 0xAFA94693, 0x8D4DA2A0, 0xED0882A3),
    "IMessage": _iid(0x936F033B, 0xC6C047DB, 0xBB0882F8, 0x13C1E613),
    "IAttributeList": _iid(0x1E5F0AEB, 0xCC7F4533, 0xA2544011, 0x38AD5EE4),
}
K_OK, K_FALSE, K_NO_INTERFACE, K_INVALID, K_NOT_IMPL = 0, 1, 0x80004002, 2, 3
AUDIO, EVENT, INPUT, OUTPUT = 0, 1, 0, 1
K_REALTIME, K_OFFLINE, K_SAMPLE32 = 0, 2, 0
K_MONO, K_STEREO = 1 << 19, 0x3
CLASSE_AUDIO = b"Audio Module Class"
CLASSE_CONTROLE = b"Component Controller Class"


# ───────────────────────── estruturas ─────────────────────────
class PClassInfo(Structure):
    _fields_ = [("cid", c_ubyte * 16), ("cardinality", c_int32), ("category", c_char * 32), ("name", c_char * 64)]


class PClassInfo2(Structure):
    _fields_ = [("cid", c_ubyte * 16), ("cardinality", c_int32), ("category", c_char * 32), ("name", c_char * 64),
                ("classFlags", c_uint32), ("subCategories", c_char * 128), ("vendor", c_char * 64),
                ("version", c_char * 64), ("sdkVersion", c_char * 64)]


class PFactoryInfo(Structure):
    _fields_ = [("vendor", c_char * 64), ("url", c_char * 256), ("email", c_char * 128), ("flags", c_int32)]


class BusInfo(Structure):
    _fields_ = [("mediaType", c_int32), ("direction", c_int32), ("channelCount", c_int32), ("name", c_wchar * 128),
                ("busType", c_int32), ("flags", c_uint32)]


class ParameterInfo(Structure):
    _fields_ = [("id", c_uint32), ("title", c_wchar * 128), ("shortTitle", c_wchar * 128), ("units", c_wchar * 128),
                ("stepCount", c_int32), ("defaultNormalizedValue", c_double), ("unitId", c_int32), ("flags", c_int32)]


class ProcessSetup(Structure):
    _fields_ = [("processMode", c_int32), ("symbolicSampleSize", c_int32), ("maxSamplesPerBlock", c_int32),
                ("sampleRate", c_double)]


class AudioBusBuffers(Structure):
    _fields_ = [("numChannels", c_int32), ("silenceFlags", c_uint64), ("channelBuffers32", POINTER(POINTER(c_float)))]


class ProcessData(Structure):
    _fields_ = [("processMode", c_int32), ("symbolicSampleSize", c_int32), ("numSamples", c_int32),
                ("numInputs", c_int32), ("numOutputs", c_int32), ("inputs", POINTER(AudioBusBuffers)),
                ("outputs", POINTER(AudioBusBuffers)), ("inputParameterChanges", c_void_p),
                ("outputParameterChanges", c_void_p), ("inputEvents", c_void_p), ("outputEvents", c_void_p),
                ("processContext", c_void_p)]


class ViewRect(Structure):
    _fields_ = [("left", c_int32), ("top", c_int32), ("right", c_int32), ("bottom", c_int32)]


# ───────────────────────── chamar o plugin (tabela de funções) ─────────────────────────
_FN_CACHE = {}


def _chamar(obj, indice, restype, argtypes, *args):
    """Método número `indice` da tabela do objeto COM `obj` (o 1º argumento é sempre o próprio objeto)."""
    vt = cast(obj, POINTER(POINTER(c_void_p)))[0]
    chave = (restype, tuple(argtypes))
    proto = _FN_CACHE.get(chave)
    if proto is None:
        proto = _FN_CACHE[chave] = WINFUNCTYPE(restype, c_void_p, *argtypes)
    return proto(vt[indice])(obj, *args)


def _qi(obj, nome):
    """queryInterface → ponteiro (ou None)."""
    out = c_void_p()
    iid = (c_ubyte * 16).from_buffer_copy(IID[nome])
    r = _chamar(obj, 0, c_int32, [c_void_p, POINTER(c_void_p)], cast(iid, c_void_p), byref(out))
    return out.value if (r & 0xFFFFFFFF) == K_OK and out.value else None


def _release(obj):
    if obj:
        try:
            _chamar(obj, 2, c_uint32, [])
        except Exception:
            pass


# índices: FUnknown 0..2; IPluginBase 3 initialize, 4 terminate
# IComponent: 5 getControllerClassId, 6 setIoMode, 7 getBusCount, 8 getBusInfo, 9 getRoutingInfo, 10 activateBus,
#             11 setActive, 12 setState, 13 getState
# IAudioProcessor: 3 setBusArrangements, 4 getBusArrangement, 5 canProcessSampleSize, 6 getLatencySamples,
#                  7 setupProcessing, 8 setProcessing, 9 process, 10 getTailSamples
# IEditController: 5 setComponentState, 6 setState, 7 getState, 8 getParameterCount, 9 getParameterInfo,
#                  10 getParamStringByValue, 11 getParamValueByString, 12 normalizedParamToPlain,
#                  13 plainParamToNormalized, 14 getParamNormalized, 15 setParamNormalized, 16 setComponentHandler,
#                  17 createView
# IConnectionPoint: 3 connect, 4 disconnect, 5 notify
# IPlugView: 3 isPlatformTypeSupported, 4 attached, 5 removed, 6 onWheel, 7 onKeyDown, 8 onKeyUp, 9 getSize,
#            10 onSize, 11 onFocus, 12 setFrame, 13 canResize, 14 checkSizeConstraint


# ───────────────────────── objetos do anfitrião (o plugin chama de volta) ─────────────────────────
class _Objeto:
    """Objeto COM feito em Python: um bloco de memória cujo 1º campo aponta para a tabela de funções (callbacks).
    `interfaces` = nomes aceitos no queryInterface; `metodos` = funções Python na ordem da tabela (depois dos 3 do
    FUnknown). Referências guardadas em _VIVOS (o plugin pode guardar o ponteiro)."""
    _VIVOS = {}

    def __init__(self, interfaces, metodos):
        self.iids = {IID[n] for n in interfaces} | {IID["FUnknown"]}
        self.refs = 1
        tipos = [WINFUNCTYPE(c_int32, c_void_p, c_void_p, POINTER(c_void_p)),
                 WINFUNCTYPE(c_uint32, c_void_p), WINFUNCTYPE(c_uint32, c_void_p)]
        fns = [tipos[0](self._qi), tipos[1](self._add), tipos[2](self._rel)]
        for proto, fn in metodos:
            fns.append(proto(fn))
        self._fns = fns
        self._tabela = (c_void_p * len(fns))(*[cast(f, c_void_p) for f in fns])
        self._bloco = (c_void_p * 1)(cast(self._tabela, c_void_p))
        self.ptr = cast(self._bloco, c_void_p).value
        _Objeto._VIVOS[self.ptr] = self

    def _qi(self, this, iid, out):
        if bytes(ctypes.string_at(iid, 16)) in self.iids:
            out[0] = self.ptr
            self.refs += 1
            return K_OK
        out[0] = None
        return K_NO_INTERFACE - (1 << 32)

    def _add(self, this):
        self.refs += 1
        return self.refs

    def _rel(self, this):
        self.refs = max(0, self.refs - 1)
        return self.refs   # a memória fica com o Python (_VIVOS) enquanto o plugin existir


T = WINFUNCTYPE


class _Fluxo(_Objeto):
    """IBStream em memória (ajuste do plugin)."""

    def __init__(self, dados=b""):
        self.buf = bytearray(dados)
        self.pos = 0
        super().__init__(["IBStream"], [
            (T(c_int32, c_void_p, c_void_p, c_int32, POINTER(c_int32)), self._ler),
            (T(c_int32, c_void_p, c_void_p, c_int32, POINTER(c_int32)), self._escrever),
            (T(c_int32, c_void_p, c_int64, c_int32, POINTER(c_int64)), self._seek),
            (T(c_int32, c_void_p, POINTER(c_int64)), self._tell)])

    def _ler(self, this, buf, n, lidos):
        n = max(0, min(n, len(self.buf) - self.pos))
        if n:
            ctypes.memmove(buf, bytes(self.buf[self.pos:self.pos + n]), n)
        self.pos += n
        if lidos:
            lidos[0] = n
        return K_OK

    def _escrever(self, this, buf, n, escritos):
        dados = ctypes.string_at(buf, n)
        fim = self.pos + n
        if fim > len(self.buf):
            self.buf.extend(b"\0" * (fim - len(self.buf)))
        self.buf[self.pos:fim] = dados
        self.pos = fim
        if escritos:
            escritos[0] = n
        return K_OK

    def _seek(self, this, pos, modo, res):
        base = {0: 0, 1: self.pos, 2: len(self.buf)}.get(modo, 0)
        self.pos = max(0, base + pos)
        if res:
            res[0] = self.pos
        return K_OK

    def _tell(self, this, pos):
        if pos:
            pos[0] = self.pos
        return K_OK


class _Atributos(_Objeto):
    """IAttributeList (mensagens entre processador e controlador)."""

    def __init__(self):
        self.d = {}
        P = c_char_p
        super().__init__(["IAttributeList"], [
            (T(c_int32, c_void_p, P, c_int64), lambda s, k, v: self._set(k, v)),
            (T(c_int32, c_void_p, P, POINTER(c_int64)), lambda s, k, o: self._get(k, o)),
            (T(c_int32, c_void_p, P, c_double), lambda s, k, v: self._set(k, v)),
            (T(c_int32, c_void_p, P, POINTER(c_double)), lambda s, k, o: self._get(k, o)),
            (T(c_int32, c_void_p, P, c_void_p), lambda s, k, v: self._set(k, ctypes.wstring_at(v))),
            (T(c_int32, c_void_p, P, c_void_p, c_uint32), self._get_str),
            (T(c_int32, c_void_p, P, c_void_p, c_uint32), lambda s, k, p, n: self._set(k, ctypes.string_at(p, n))),
            (T(c_int32, c_void_p, P, POINTER(c_void_p), POINTER(c_uint32)), self._get_bin)])

    def _set(self, k, v):
        self.d[k] = v
        return K_OK

    def _get(self, k, out):
        if k not in self.d:
            return K_FALSE
        out[0] = self.d[k]
        return K_OK

    def _get_str(self, this, k, buf, tam):
        v = self.d.get(k)
        if not isinstance(v, str):
            return K_FALSE
        b = (v[: max(0, tam // 2 - 1)] + "\0").encode("utf-16-le")
        ctypes.memmove(buf, b, len(b))
        return K_OK

    def _get_bin(self, this, k, data, tam):
        v = self.d.get(k)
        if not isinstance(v, (bytes, bytearray)):
            return K_FALSE
        buf = ctypes.create_string_buffer(bytes(v), len(v))
        self._ultimo = buf   # vale até a próxima leitura (como no SDK)
        data[0] = cast(buf, c_void_p).value
        tam[0] = len(v)
        return K_OK


class _Mensagem(_Objeto):
    def __init__(self):
        self.idm = ctypes.create_string_buffer(b"", 128)
        self.attr = _Atributos()
        super().__init__(["IMessage"], [
            (T(c_void_p, c_void_p), lambda s: cast(self.idm, c_void_p).value),   # memória da mensagem (viva com ela)
            (T(None, c_void_p, c_char_p), self._set_id),
            (T(c_void_p, c_void_p), lambda s: self.attr.ptr)])

    def _set_id(self, this, v):
        self.idm = ctypes.create_string_buffer(v or b"", 128)


class _Anfitriao(_Objeto):
    """IHostApplication: nome e fábrica de mensagens."""

    def __init__(self):
        super().__init__(["IHostApplication"], [
            (T(c_int32, c_void_p, c_void_p), self._nome),
            (T(c_int32, c_void_p, c_void_p, c_void_p, POINTER(c_void_p)), self._criar)])

    def _nome(self, this, buf):
        b = "KANIVETE\0".encode("utf-16-le")
        ctypes.memmove(buf, b, len(b))
        return K_OK

    def _criar(self, this, cid, iid, out):
        quer = bytes(ctypes.string_at(iid, 16))
        if quer == IID["IMessage"]:
            out[0] = _Mensagem().ptr
            return K_OK
        if quer == IID["IAttributeList"]:
            out[0] = _Atributos().ptr
            return K_OK
        out[0] = None
        return K_FALSE


class _Fila(_Objeto):
    """IParamValueQueue: um ponto (amostra 0) por bloco."""

    def __init__(self, pid, valor):
        self.pid, self.valor = pid, valor
        super().__init__(["IParamValueQueue"], [
            (T(c_uint32, c_void_p), lambda s: self.pid),
            (T(c_int32, c_void_p), lambda s: 1),
            (T(c_int32, c_void_p, c_int32, POINTER(c_int32), POINTER(c_double)), self._ponto),
            (T(c_int32, c_void_p, c_int32, c_double, POINTER(c_int32)), lambda s, o, v, i: K_FALSE)])

    def _ponto(self, this, i, off, val):
        if i != 0:
            return K_FALSE
        off[0] = 0
        val[0] = self.valor
        return K_OK


class _Mudancas(_Objeto):
    """IParameterChanges com as mudanças pendentes deste bloco."""

    def __init__(self):
        self.filas = []
        super().__init__(["IParameterChanges"], [
            (T(c_int32, c_void_p), lambda s: len(self.filas)),
            (T(c_void_p, c_void_p, c_int32), lambda s, i: self.filas[i].ptr if 0 <= i < len(self.filas) else None),
            (T(c_void_p, c_void_p, POINTER(c_uint32), POINTER(c_int32)), lambda s, pid, idx: None)])

    def preparar(self, pendentes):
        self.filas = [_Fila(pid, v) for pid, v in pendentes.items()]


class _Manipulador(_Objeto):
    """IComponentHandler: o controlador (janela do plugin) avisa que mexeu num parâmetro."""

    def __init__(self, dono):
        self.dono = dono
        super().__init__(["IComponentHandler"], [
            (T(c_int32, c_void_p, c_uint32), lambda s, pid: K_OK),
            (T(c_int32, c_void_p, c_uint32, c_double), self._edit),
            (T(c_int32, c_void_p, c_uint32), lambda s, pid: K_OK),
            (T(c_int32, c_void_p, c_int32), lambda s, f: K_OK)])

    def _edit(self, this, pid, valor):
        self.dono._pendentes[pid] = valor
        self.dono.mexeu = True
        return K_OK


class _Moldura(_Objeto):
    """IPlugFrame: o plugin pede para mudar o tamanho da janela."""

    def __init__(self, dono):
        self.dono = dono
        super().__init__(["IPlugFrame"], [(T(c_int32, c_void_p, c_void_p, POINTER(ViewRect)), self._resize)])

    def _resize(self, this, view, r):
        self.dono._redimensionar(r[0].right - r[0].left, r[0].bottom - r[0].top)
        _chamar(view, 10, c_int32, [POINTER(ViewRect)], r)   # onSize
        return K_OK


# ───────────────────────── módulo (a DLL) ─────────────────────────
def _arquivo_dll(caminho):
    """.vst3 pode ser um arquivo (DLL) ou uma pasta (pacote: Contents/x86_64-win/<nome>.vst3)."""
    if os.path.isdir(caminho):
        nome = os.path.basename(caminho)
        for sub in ("x86_64-win", "x64-win"):
            p = os.path.join(caminho, "Contents", sub, nome)
            if os.path.isfile(p):
                return p
        return None
    return caminho


_MODULOS = {}


class _Modulo:
    def __init__(self, caminho):
        dll_path = _arquivo_dll(caminho)
        if not dll_path:
            raise RuntimeError("não achei a DLL do plugin")
        self.dll = ctypes.WinDLL(dll_path)
        try:
            self.dll.InitDll.restype = ctypes.c_bool
            self.dll.InitDll()
        except AttributeError:
            pass
        self.dll.GetPluginFactory.restype = c_void_p
        self.fab = self.dll.GetPluginFactory()
        if not self.fab:
            raise RuntimeError("o plugin não entregou a fábrica")
        self.fab2 = _qi(self.fab, "IPluginFactory2")

    def classes(self):
        out = []
        n = _chamar(self.fab, 4, c_int32, [])
        for i in range(n):
            if self.fab2:
                ci = PClassInfo2()
                _chamar(self.fab2, 7, c_int32, [c_int32, POINTER(PClassInfo2)], i, byref(ci))
                out.append({"cid": bytes(ci.cid), "categoria": ci.category, "nome": ci.name.decode("utf-8", "replace"),
                            "sub": ci.subCategories.decode("utf-8", "replace"), "fabricante": ci.vendor.decode("utf-8", "replace"),
                            "versao": ci.version.decode("utf-8", "replace")})
            else:
                ci = PClassInfo()
                _chamar(self.fab, 5, c_int32, [c_int32, POINTER(PClassInfo)], i, byref(ci))
                out.append({"cid": bytes(ci.cid), "categoria": ci.category, "nome": ci.name.decode("utf-8", "replace"),
                            "sub": "", "fabricante": "", "versao": ""})
        if not any(c["fabricante"] for c in out):
            fi = PFactoryInfo()
            if _chamar(self.fab, 3, c_int32, [POINTER(PFactoryInfo)], byref(fi)) == K_OK:
                for c in out:
                    c["fabricante"] = fi.vendor.decode("utf-8", "replace")
        return out

    def criar(self, cid, iface):
        out = c_void_p()
        c = (c_ubyte * 16).from_buffer_copy(cid)
        i = (c_ubyte * 16).from_buffer_copy(IID[iface])
        r = _chamar(self.fab, 6, c_int32, [c_void_p, c_void_p, POINTER(c_void_p)], cast(c, c_void_p), cast(i, c_void_p), byref(out))
        return out.value if r == K_OK and out.value else None


def _modulo(caminho):
    m = _MODULOS.get(caminho)
    if m is None:
        m = _MODULOS[caminho] = _Modulo(caminho)
    return m


def pasta_vst3():
    return os.path.join(os.environ.get("COMMONPROGRAMFILES", r"C:\Program Files\Common Files"), "VST3")


def pastas_vst3():
    """a pasta padrão do Windows e <raiz_dados>/Plugins VST3 (no disco do app: plugin sem instalador, sem pedir
    administrador e sem encher o C)"""
    out = [pasta_vst3()]
    try:
        from Functions.midia import raiz_dados
        out.append(os.path.join(raiz_dados(), "Plugins VST3"))
    except Exception:
        pass
    return [p for p in out if os.path.isdir(p)]


def varrer(pastas=None):
    """Plugins de efeito de áudio instalados: [{caminho, nome, fabricante, sub, versao}]. Abre cada DLL (rápido: ~0,1 s
    a maioria); o que falhar entra com 'erro'."""
    out = []
    for raiz in pastas or pastas_vst3():
        for base, dirs, arqs in os.walk(raiz):
            achados = [d for d in dirs if d.lower().endswith(".vst3")] + [a for a in arqs if a.lower().endswith(".vst3")]
            dirs[:] = [d for d in dirs if not d.lower().endswith(".vst3")]   # não entra no pacote
            for nome in achados:
                cam = os.path.join(base, nome)
                try:
                    for c in _modulo(cam).classes():
                        if c["categoria"] == CLASSE_AUDIO:
                            out.append({"caminho": cam, "nome": c["nome"], "fabricante": c["fabricante"], "sub": c["sub"],
                                        "versao": c["versao"], "cid": c["cid"].hex()})
                except Exception as e:
                    out.append({"caminho": cam, "nome": os.path.splitext(nome)[0], "erro": f"{type(e).__name__}: {e}"})
    return out


# ───────────────────────── plugin ─────────────────────────
class Plugin:
    BLOCO = 1024

    def __init__(self, caminho, cid=None):
        self.caminho, self.cid = caminho, bytes.fromhex(cid) if isinstance(cid, str) else cid
        self.comp = self.proc = self.ctrl = None
        self._pendentes = {}
        self.mexeu = False
        self.janela = None
        self._trava = threading.RLock()

    # carregar: processador (IComponent + IAudioProcessor) e controlador (o mesmo objeto ou outro, conectados)
    def carregar(self, sr=48000, canais=2, modo=K_OFFLINE):
        m = _modulo(self.caminho)
        cls = [c for c in m.classes() if c["categoria"] == CLASSE_AUDIO]
        if not cls:
            raise RuntimeError("o arquivo não tem efeito de áudio")
        info = next((c for c in cls if self.cid and c["cid"] == self.cid), cls[0])
        self.cid, self.nome = info["cid"], info["nome"]
        self.host = _Anfitriao()
        self.comp = m.criar(self.cid, "IComponent")
        if not self.comp:
            raise RuntimeError("o plugin não criou o processador")
        _chamar(self.comp, 3, c_int32, [c_void_p], self.host.ptr)
        self.proc = _qi(self.comp, "IAudioProcessor")
        if not self.proc:
            raise RuntimeError("o plugin não processa áudio")
        # controlador: no mesmo objeto (efeito "único") ou numa classe à parte
        self.ctrl = _qi(self.comp, "IEditController")
        self.ctrl_separado = False
        if not self.ctrl:
            ccid = (c_ubyte * 16)()
            if _chamar(self.comp, 5, c_int32, [c_void_p], cast(ccid, c_void_p)) == K_OK and any(ccid):
                self.ctrl = m.criar(bytes(ccid), "IEditController")
                if self.ctrl:
                    self.ctrl_separado = True
                    _chamar(self.ctrl, 3, c_int32, [c_void_p], self.host.ptr)
        self.manip = _Manipulador(self)
        if self.ctrl:
            _chamar(self.ctrl, 16, c_int32, [c_void_p], self.manip.ptr)
            if self.ctrl_separado:   # processador ↔ controlador conversam por mensagens
                a, b = _qi(self.comp, "IConnectionPoint"), _qi(self.ctrl, "IConnectionPoint")
                if a and b:
                    _chamar(a, 3, c_int32, [c_void_p], b)
                    _chamar(b, 3, c_int32, [c_void_p], a)
                self._conexoes = (a, b)
        # barramentos: entrada/saída principal em estéreo (ou mono, se o plugin só aceitar)
        self.canais = canais
        n_in = _chamar(self.comp, 7, c_int32, [c_int32, c_int32], AUDIO, INPUT)
        n_out = _chamar(self.comp, 7, c_int32, [c_int32, c_int32], AUDIO, OUTPUT)
        self.n_in, self.n_out = n_in, n_out
        arr = K_STEREO if canais == 2 else K_MONO
        ins = (c_uint64 * max(1, n_in))(*([arr] + [arr] * (n_in - 1))) if n_in else (c_uint64 * 1)()
        outs = (c_uint64 * max(1, n_out))(*([arr] * max(1, n_out)))
        _chamar(self.proc, 3, c_int32, [c_void_p, c_int32, c_void_p, c_int32], cast(ins, c_void_p), n_in, cast(outs, c_void_p), n_out)
        # só o barramento principal de cada lado fica ligado; canais lidos depois do arranjo (o plugin pode ter recusado)
        self.can_in, self.can_out = [], []
        for d, n, lista in ((INPUT, n_in, self.can_in), (OUTPUT, n_out, self.can_out)):
            for i in range(n):
                _chamar(self.comp, 10, c_int32, [c_int32, c_int32, c_int32, ctypes.c_ubyte], AUDIO, d, i, 1 if i == 0 else 0)
                bi = BusInfo()
                _chamar(self.comp, 8, c_int32, [c_int32, c_int32, c_int32, POINTER(BusInfo)], AUDIO, d, i, byref(bi))
                lista.append(bi.channelCount)
        self.sr = sr
        setup = ProcessSetup(modo, K_SAMPLE32, self.BLOCO, float(sr))
        _chamar(self.proc, 7, c_int32, [POINTER(ProcessSetup)], byref(setup))
        _chamar(self.comp, 11, c_int32, [ctypes.c_ubyte], 1)
        _chamar(self.proc, 8, c_int32, [ctypes.c_ubyte], 1)
        self.latencia = _chamar(self.proc, 6, c_uint32, [])
        self.mudancas = _Mudancas()
        self._sincronizar_controlador()
        return self

    def _sincronizar_controlador(self):
        """O controlador lê o ajuste do processador (setComponentState), como faz um DAW ao abrir."""
        if self.ctrl and self.ctrl_separado:
            f = _Fluxo()
            if _chamar(self.comp, 13, c_int32, [c_void_p], f.ptr) == K_OK:
                f.pos = 0
                _chamar(self.ctrl, 5, c_int32, [c_void_p], f.ptr)

    def parametros(self):
        if not self.ctrl:
            return []
        out = []
        for i in range(_chamar(self.ctrl, 8, c_int32, [])):
            pi = ParameterInfo()
            if _chamar(self.ctrl, 9, c_int32, [c_int32, POINTER(ParameterInfo)], i, byref(pi)) != K_OK:
                continue
            v = _chamar(self.ctrl, 14, c_double, [c_uint32], pi.id)
            txt = (c_wchar * 128)()
            _chamar(self.ctrl, 10, c_int32, [c_uint32, c_double, c_void_p], pi.id, v, cast(txt, c_void_p))
            out.append({"id": pi.id, "nome": pi.title, "curto": pi.shortTitle, "unidade": pi.units, "passos": pi.stepCount,
                        "padrao": pi.defaultNormalizedValue, "valor": v, "texto": txt.value, "flags": pi.flags})
        return out

    def definir(self, pid, valor):
        """Parâmetro 0..1: vai ao controlador (janela) e ao processador no próximo bloco."""
        valor = min(1.0, max(0.0, float(valor)))
        if self.ctrl:
            _chamar(self.ctrl, 15, c_int32, [c_uint32, c_double], int(pid), valor)
        self._pendentes[int(pid)] = valor

    def processar(self, audio, compensar=True):
        """audio: float32 [canais, amostras] → mesma forma. Blocos de BLOCO amostras; a cauda (reverb/eco) não é
        estendida aqui — o chamador soma silêncio no fim se quiser a cauda. compensar: o atraso do plugin
        (getLatencySamples; Goyo 2238 amostras) sai do começo — o som continua no lugar do vídeo."""
        with self._trava:
            audio = np.ascontiguousarray(audio, np.float32)
            lat = int(_chamar(self.proc, 6, c_uint32, [])) if compensar else 0
            n0 = audio.shape[1]
            if lat:
                audio = np.concatenate([audio, np.zeros((audio.shape[0], lat), np.float32)], 1)
            ch, n = audio.shape
            cin = self.can_in[0] if self.can_in else 0
            cout = self.can_out[0] if self.can_out else ch
            ent = np.zeros((max(cin, 1), self.BLOCO), np.float32)
            sai = np.zeros((max(cout, 1), self.BLOCO), np.float32)
            p_in = (POINTER(c_float) * max(cin, 1))(*[ent[c].ctypes.data_as(POINTER(c_float)) for c in range(max(cin, 1))])
            p_out = (POINTER(c_float) * max(cout, 1))(*[sai[c].ctypes.data_as(POINTER(c_float)) for c in range(max(cout, 1))])
            b_in = (AudioBusBuffers * max(1, self.n_in))()
            b_out = (AudioBusBuffers * max(1, self.n_out))()
            vazio = (POINTER(c_float) * 8)()
            for i in range(self.n_in):
                b_in[i].numChannels = self.can_in[i] if i < len(self.can_in) else 0
                b_in[i].channelBuffers32 = p_in if i == 0 else cast(vazio, POINTER(POINTER(c_float)))
            for i in range(self.n_out):
                b_out[i].numChannels = self.can_out[i] if i < len(self.can_out) else 0
                b_out[i].channelBuffers32 = p_out if i == 0 else cast(vazio, POINTER(POINTER(c_float)))
            pd = ProcessData(K_OFFLINE, K_SAMPLE32, 0, self.n_in, self.n_out, b_in, b_out, None, None, None, None, None)
            res = np.zeros((ch, n), np.float32)
            for a in range(0, n, self.BLOCO):
                m = min(self.BLOCO, n - a)
                for c in range(max(cin, 1)):
                    ent[c, :m] = audio[min(c, ch - 1), a:a + m] if cin else 0
                    ent[c, m:] = 0
                if self._pendentes:
                    self.mudancas.preparar(self._pendentes)
                    pd.inputParameterChanges = self.mudancas.ptr
                    self._pendentes = {}
                else:
                    pd.inputParameterChanges = None
                pd.numSamples = m
                _chamar(self.proc, 9, c_int32, [POINTER(ProcessData)], byref(pd))
                for c in range(ch):
                    res[c, a:a + m] = sai[min(c, max(cout, 1) - 1), :m]
            return res[:, lat:lat + n0] if lat else res

    def estado(self):
        """Ajuste do plugin (processador + controlador) em bytes: [tamanho do 1º][1º][2º]."""
        a, b = _Fluxo(), _Fluxo()
        _chamar(self.comp, 13, c_int32, [c_void_p], a.ptr)
        if self.ctrl and self.ctrl_separado:
            _chamar(self.ctrl, 7, c_int32, [c_void_p], b.ptr)
        return struct.pack("<I", len(a.buf)) + bytes(a.buf) + bytes(b.buf)

    def restaurar(self, dados):
        n = struct.unpack("<I", dados[:4])[0]
        a, b = _Fluxo(dados[4:4 + n]), _Fluxo(dados[4 + n:])
        _chamar(self.comp, 12, c_int32, [c_void_p], a.ptr)
        if self.ctrl:
            a.pos = 0
            _chamar(self.ctrl, 5, c_int32, [c_void_p], a.ptr)
            if self.ctrl_separado and len(b.buf):
                _chamar(self.ctrl, 6, c_int32, [c_void_p], b.ptr)

    def fechar(self):
        with self._trava:
            try:
                if self.proc:
                    _chamar(self.proc, 8, c_int32, [ctypes.c_ubyte], 0)
                if self.comp:
                    _chamar(self.comp, 11, c_int32, [ctypes.c_ubyte], 0)
                if getattr(self, "_conexoes", None):
                    a, b = self._conexoes
                    if a and b:
                        _chamar(a, 4, c_int32, [c_void_p], b)
                        _chamar(b, 4, c_int32, [c_void_p], a)
                if self.ctrl and self.ctrl_separado:
                    _chamar(self.ctrl, 4, c_int32, [])
                    _release(self.ctrl)
                if self.comp:
                    _chamar(self.comp, 4, c_int32, [])
                    _release(self.proc)
                    _release(self.comp)
            finally:
                self.comp = self.proc = self.ctrl = None

    # ── janela do plugin (Win32 própria, com a linha de mensagens dela) ──
    def _redimensionar(self, w, h):
        if self.janela:
            self.janela.redimensionar(w, h)

    def abrir_janela(self, titulo=None, ao_fechar=None):
        """Abre a janela do próprio plugin. Precisa ser chamado na linha que criou o plugin? Não: o VST3 pede que a
        janela e o controlador fiquem na mesma linha — por isso Janela roda o plugin inteiro numa linha própria
        (ver abrir_editor). Aqui, só para o teste na linha principal (bloqueia até fechar)."""
        if not self.ctrl:
            raise RuntimeError("o plugin não tem janela")
        view = _chamar(self.ctrl, 17, c_void_p, [c_char_p], b"editor")
        if not view:
            raise RuntimeError("o plugin não tem janela")
        if _chamar(view, 3, c_int32, [c_char_p], b"HWND") != K_OK:
            _release(view)
            raise RuntimeError("a janela do plugin não é de Windows")
        r = ViewRect()
        _chamar(view, 9, c_int32, [POINTER(ViewRect)], byref(r))
        self.janela = _Janela(titulo or self.nome, max(200, r.right - r.left), max(100, r.bottom - r.top))
        self.moldura = _Moldura(self)
        _chamar(view, 12, c_int32, [c_void_p], self.moldura.ptr)
        _chamar(view, 4, c_int32, [c_void_p, c_char_p], self.janela.hwnd, b"HWND")
        self.janela.laco()   # até fechar
        _chamar(view, 12, c_int32, [c_void_p], None)
        _chamar(view, 5, c_int32, [])
        _release(view)
        self.janela = None
        if ao_fechar:
            ao_fechar()


# ───────────────────────── janela Win32 mínima ─────────────────────────
from ctypes import wintypes  # noqa: E402

_u32 = ctypes.windll.user32
_k32 = ctypes.windll.kernel32
_WNDPROC = WINFUNCTYPE(ctypes.c_ssize_t, wintypes.HWND, c_uint32, wintypes.WPARAM, wintypes.LPARAM)
_u32.DefWindowProcW.restype = ctypes.c_ssize_t
_u32.DefWindowProcW.argtypes = [wintypes.HWND, c_uint32, wintypes.WPARAM, wintypes.LPARAM]
_u32.CreateWindowExW.restype = wintypes.HWND
_u32.CreateWindowExW.argtypes = [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD, c_int32, c_int32,
                                 c_int32, c_int32, wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID]


class _WNDCLASS(Structure):
    _fields_ = [("style", c_uint32), ("lpfnWndProc", _WNDPROC), ("cbClsExtra", c_int32), ("cbWndExtra", c_int32),
                ("hInstance", wintypes.HINSTANCE), ("hIcon", wintypes.HICON), ("hCursor", wintypes.HANDLE),
                ("hbrBackground", wintypes.HBRUSH), ("lpszMenuName", wintypes.LPCWSTR), ("lpszClassName", wintypes.LPCWSTR)]


_CLASSE = {"ok": False}


_PAINEIS = {}   # hwnd do painel encaixado → _Painel (comandos do app chegam como WM_APP)
_MODO = {}      # "servir": processo de um espaço do Rack (o painel pode sumir sem fechar o processo)


def _wndproc(hwnd, msg, wp, lp):
    if msg == 0x0002 and _MODO.get("servir"):   # WM_DESTROY servindo: só o PAINEL some (o som continua)
        obj = _PAINEIS.pop(hwnd, None)
        if obj is not None and getattr(obj, "dono", None):
            obj.dono.painel_sumiu()
        return 0
    if msg == 0x8001 and hwnd in _PAINEIS:   # WM_APP+1: comando do app (fila do painel)
        _PAINEIS[hwnd].comandos()
        return 0
    if msg == 0x0113 and hwnd in _PAINEIS and hasattr(_PAINEIS[hwnd], "relogio"):   # WM_TIMER
        _PAINEIS[hwnd].relogio()
        return 0
    if msg == 0x0010:   # WM_CLOSE
        _u32.DestroyWindow(hwnd)
        return 0
    if msg == 0x0002:   # WM_DESTROY
        _u32.PostQuitMessage(0)
        return 0
    return _u32.DefWindowProcW(hwnd, msg, wp, lp)


_WNDPROC_REF = _WNDPROC(_wndproc)


class _Janela:
    ESTILO = 0x00C00000 | 0x00080000 | 0x00020000 | 0x10000000   # legenda, menu do sistema, minimizar, visível

    def __init__(self, titulo, w, h):
        if not _CLASSE["ok"]:
            wc = _WNDCLASS()
            wc.lpfnWndProc = _WNDPROC_REF
            wc.hInstance = _k32.GetModuleHandleW(None)
            wc.hCursor = _u32.LoadCursorW(None, 32512)
            wc.lpszClassName = "KanivetePluginVST3"
            _u32.RegisterClassW(byref(wc))
            _CLASSE["ok"] = True
        r = wintypes.RECT(0, 0, w, h)
        _u32.AdjustWindowRect(byref(r), self.ESTILO, False)
        self.hwnd = _u32.CreateWindowExW(0x00000008, "KanivetePluginVST3", titulo, self.ESTILO, 200, 160,   # sempre acima
                                         r.right - r.left, r.bottom - r.top, None, None, _k32.GetModuleHandleW(None), None)

    def redimensionar(self, w, h):
        r = wintypes.RECT(0, 0, w, h)
        _u32.AdjustWindowRect(byref(r), self.ESTILO, False)
        _u32.SetWindowPos(self.hwnd, None, 0, 0, r.right - r.left, r.bottom - r.top, 0x0002 | 0x0004)

    def laco(self):
        msg = wintypes.MSG()
        while _u32.GetMessageW(byref(msg), None, 0, 0) > 0:
            _u32.TranslateMessage(byref(msg))
            _u32.DispatchMessageW(byref(msg))


class _Painel:
    """Plugin ENCAIXADO num painel do editor: subjanela (WS_CHILD) da janela do KANIVETE — de outro processo — posta
    sobre a área do painel (a página manda o retângulo). O plugin fica centrado num fundo escuro; se ele aceita mudar de
    tamanho (canResize), ocupa o painel. Comandos (uma linha JSON por vez no stdin): {"r": [x, y, w, h]} (px reais no
    cliente da janela-mãe), {"v": 0|1}, {"p": hwnd, "r": [...]} (mudou de janela: painel solto), {"q": 1}."""
    ESTILO = 0x40000000 | 0x04000000 | 0x02000000   # WS_CHILD | WS_CLIPSIBLINGS | WS_CLIPCHILDREN

    @staticmethod
    def _registrar_classe():
        if not _CLASSE.get("painel"):
            wc = _WNDCLASS()
            wc.lpfnWndProc = _WNDPROC_REF
            wc.hInstance = _k32.GetModuleHandleW(None)
            wc.hCursor = _u32.LoadCursorW(None, 32512)
            wc.hbrBackground = ctypes.windll.gdi32.CreateSolidBrush(0x00141414)
            wc.lpszClassName = "KanivetePluginPainel"
            _u32.RegisterClassW(byref(wc))
            _CLASSE["painel"] = True

    def __init__(self, pai, rect):
        import queue as _q
        _Painel._registrar_classe()
        x, y, w, h = [int(v) for v in rect]
        self.pai = pai
        self.rect0 = (x, y, max(1, w), max(1, h))
        # nasce numa janela DESTE processo, visível mas fora da tela, e só vai para a do KANIVETE depois do attached
        # (levar): os plugins da jhudstudio, no attached, procuram a janela de cima visível do próprio processo — sem
        # nenhuma (a de cima era a do KANIVETE, de outro processo) davam ponteiro nulo e o processo caía
        self.casa = _u32.CreateWindowExW(0x08000080, "KanivetePluginPainel", "KANIVETE", 0x90000000, -32000, -32000,
                                         max(1, w), max(1, h), None, None, _k32.GetModuleHandleW(None), None)   # WS_POPUP|WS_VISIBLE, ferramenta, sem foco
        self.hwnd = _u32.CreateWindowExW(0, "KanivetePluginPainel", "KANIVETE plugin", self.ESTILO, 0, 0, max(1, w), max(1, h),
                                         self.casa, None, _k32.GetModuleHandleW(None), None)
        if not self.hwnd:
            raise RuntimeError("não criou a subjanela do painel")
        # o plugin numa subjanela própria (centrada) — o fundo do painel fica em volta
        self.palco = _u32.CreateWindowExW(0, "KanivetePluginPainel", "", 0x40000000 | 0x10000000 | 0x02000000, 0, 0, 10, 10,
                                          self.hwnd, None, _k32.GetModuleHandleW(None), None)
        self.fila = _q.Queue()
        self.view = None
        self.vw = self.vh = 0
        self.w, self.h = max(1, w), max(1, h)
        _PAINEIS[self.hwnd] = self
        self._topo()

    def levar(self):
        """depois do attached: a subjanela passa para a janela do KANIVETE, no lugar do painel"""
        _u32.SetParent(self.hwnd, self.pai)
        x, y, w, h = self.rect0
        _u32.SetWindowPos(self.hwnd, 0, x, y, w, h, 0x0010)
        self._topo()

    def _topo(self):
        # acima da página (o WebView2 também é filho da mesma janela) e sem roubar o foco
        _u32.SetWindowPos(self.hwnd, 0, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010)

    def ligar(self, view):
        self.view = view
        r = ViewRect()
        _chamar(view, 9, c_int32, [POINTER(ViewRect)], byref(r))
        self.vw, self.vh = max(1, r.right - r.left), max(1, r.bottom - r.top)
        self.cresce = _chamar(view, 13, c_int32, []) == K_OK
        self.arrumar()

    def redimensionar(self, w, h):   # o plugin pediu (IPlugFrame)
        self.vw, self.vh = max(1, w), max(1, h)
        self.arrumar(do_plugin=True)

    def arrumar(self, do_plugin=False):
        if self.view and self.cresce and not do_plugin:
            r = ViewRect(0, 0, self.w, self.h)
            _chamar(self.view, 14, c_int32, [POINTER(ViewRect)], byref(r))   # checkSizeConstraint
            self.vw, self.vh = r.right - r.left, r.bottom - r.top
            _chamar(self.view, 10, c_int32, [POINTER(ViewRect)], byref(r))   # onSize
        x, y = max(0, (self.w - self.vw) // 2), max(0, (self.h - self.vh) // 2)
        _u32.SetWindowPos(self.palco, 0, x, y, self.vw, self.vh, 0x0004 | 0x0010)

    def comandos(self):
        while not self.fila.empty():
            c = self.fila.get()
            if c.get("q"):
                _u32.DestroyWindow(self.hwnd)
                return
            if c.get("p"):
                pai = int(c["p"])
                if pai != self.pai:
                    _u32.SetParent(self.hwnd, pai)
                    self.pai = pai
            if c.get("r"):
                x, y, w, h = [int(v) for v in c["r"]]
                self.w, self.h = max(1, w), max(1, h)
                _u32.SetWindowPos(self.hwnd, 0, x, y, self.w, self.h, 0x0010)
                self._topo()
                self.arrumar()
            if "v" in c:
                _u32.ShowWindow(self.hwnd, 5 if c["v"] else 0)
                if c["v"]:
                    self._topo()


def encaixar(caminho, cid, pai, rect):
    """Processo do painel: carrega o plugin, põe a janela dele na subjanela e atende os comandos do stdin."""
    import json
    import sys
    pl = Plugin(caminho, cid).carregar(48000, modo=K_REALTIME)
    if not pl.ctrl:
        raise RuntimeError("o plugin não tem janela")
    painel = _Painel(pai, rect)
    view = _chamar(pl.ctrl, 17, c_void_p, [c_char_p], b"editor")
    if not view or _chamar(view, 3, c_int32, [c_char_p], b"HWND") != K_OK:
        raise RuntimeError("o plugin não tem janela de Windows")
    pl.janela = painel
    pl.moldura = _Moldura(pl)
    _chamar(view, 12, c_int32, [c_void_p], pl.moldura.ptr)
    _chamar(view, 4, c_int32, [c_void_p, c_char_p], painel.palco, b"HWND")
    painel.ligar(view)
    painel.levar()
    _u32.ShowWindow(painel.hwnd, 5)
    sys.stdout.write(json.dumps({"ok": 1, "tam": [painel.vw, painel.vh], "nome": pl.nome}) + "\n")
    sys.stdout.flush()

    def ler():   # linha de leitura: cada comando vai para a fila e acorda a janela
        for linha in sys.stdin:
            try:
                painel.fila.put(json.loads(linha))
                _u32.PostMessageW(painel.hwnd, 0x8001, 0, 0)
            except Exception:
                pass
        painel.fila.put({"q": 1})   # o app fechou o tubo: fecha
        _u32.PostMessageW(painel.hwnd, 0x8001, 0, 0)
    threading.Thread(target=ler, daemon=True).start()
    msg = wintypes.MSG()
    while _u32.GetMessageW(byref(msg), None, 0, 0) > 0:
        _u32.TranslateMessage(byref(msg))
        _u32.DispatchMessageW(byref(msg))
    _chamar(view, 12, c_int32, [c_void_p], None)
    _chamar(view, 5, c_int32, [])
    _release(view)
    pl.fechar()


class _Servidor:
    """Plugin de um espaço do Rack de efeitos da trilha: UM processo por plugin (como o Bitwig): o som da prévia chega
    por HTTP local (127.0.0.1, senha) e volta processado; a janela do plugin abre num painel do editor quando pedida;
    mexer no plugin manda o ajuste novo ao app (vai para o projeto). Como os DAWs: processar numa linha, janela e
    controlador na linha principal (a que carregou o plugin).

    Som: POST /p?a=<quadro de saída do 1º>&reset=0|1 — corpo float32 [L…, R…] (n quadros cada). A resposta é o
    som processado SEM compensar o atraso do plugin (é contínuo, bloco a bloco); o cabeçalho X-Inicio = a − atraso diz
    a que quadro de saída ele corresponde. reset=1 (busca, edição): o plugin limpa a cauda (desativa/ativa).
    stdin (JSON por linha): {"painel": {"janela": hwnd, "r": [x, y, w, h], "v": 0|1}}, {"estado": 1} (manda o ajuste),
    {"restaurar": base64}, {"q": 1}. stdout: {"ok", "porta", "token", "atraso"} e depois {"estado": base64}."""

    def __init__(self, caminho, cid, estado_b64=""):
        import base64
        import queue as _q
        import secrets
        _MODO["servir"] = True
        self.pl = Plugin(caminho, cid).carregar(48000, modo=K_REALTIME)
        if estado_b64:
            self.pl.restaurar(base64.b64decode(estado_b64))
        self.trava = threading.Lock()
        self.token = secrets.token_hex(12)
        self.fila = _q.Queue()
        self.painel = self.view = None
        # janelinha invisível que recebe os comandos e o relógio (mesma linha do plugin)
        _Painel._registrar_classe()
        self.hwnd = _u32.CreateWindowExW(0, "KanivetePluginPainel", "KANIVETE plugin (controle)", 0, 0, 0, 1, 1, None, None,
                                         _k32.GetModuleHandleW(None), None)
        _PAINEIS[self.hwnd] = self
        _u32.SetTimer(self.hwnd, 1, 400, None)
        self.pl.mexeu = False

    # ── som (linha do servidor HTTP) ──
    def processar(self, dados, reset):
        n = len(dados) // 8
        audio = np.frombuffer(dados, np.float32).reshape(2, n)
        with self.trava:
            if reset:
                _chamar(self.pl.proc, 8, c_int32, [ctypes.c_ubyte], 0)
                _chamar(self.pl.comp, 11, c_int32, [ctypes.c_ubyte], 0)
                _chamar(self.pl.comp, 11, c_int32, [ctypes.c_ubyte], 1)
                _chamar(self.pl.proc, 8, c_int32, [ctypes.c_ubyte], 1)
            saida = self.pl.processar(audio, compensar=False)
            atraso = int(_chamar(self.pl.proc, 6, c_uint32, []))
        return np.ascontiguousarray(saida, np.float32).tobytes(), atraso

    def servir_http(self):
        import http.server
        import urllib.parse
        dono = self

        class H(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _cors(self):
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Expose-Headers", "X-Inicio, X-Atraso")

            def do_OPTIONS(self):
                self.send_response(204)
                self._cors()
                self.send_header("Access-Control-Allow-Methods", "POST")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.end_headers()

            def do_POST(self):
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                if q.get("k", [""])[0] != dono.token:
                    self.send_response(403)
                    self.end_headers()
                    return
                corpo = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                try:
                    out, atraso = dono.processar(corpo, q.get("reset", ["0"])[0] == "1")
                    a = int(q.get("a", ["0"])[0])
                except Exception as e:
                    self.send_response(500)
                    self._cors()
                    self.end_headers()
                    self.wfile.write(str(e).encode("utf-8", "replace"))
                    return
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("X-Inicio", str(a - atraso))
                self.send_header("X-Atraso", str(atraso))
                self.send_header("Content-Length", str(len(out)))
                self.end_headers()
                self.wfile.write(out)

        srv = http.server.HTTPServer(("127.0.0.1", 0), H)   # uma conexão por vez: o plugin é um só
        self.porta = srv.server_address[1]
        threading.Thread(target=srv.serve_forever, daemon=True).start()

    # ── comandos e relógio (linha principal) ──
    def _avisar(self, d):
        import json
        import sys
        sys.stdout.write(json.dumps(d) + "\n")
        sys.stdout.flush()

    def _estado(self):
        import base64
        with self.trava:
            return base64.b64encode(self.pl.estado()).decode("ascii")

    def relogio(self):
        if self.pl.mexeu:   # mexeram no plugin (janela): o ajuste novo vai para o projeto
            self.pl.mexeu = False
            self._avisar({"estado": self._estado()})

    def comandos(self):
        import base64
        while not self.fila.empty():
            c = self.fila.get()
            if c.get("q"):
                _MODO.pop("servir", None)
                _u32.PostQuitMessage(0)
                return
            if c.get("fechar_painel") and self.painel:
                h, casa = self.painel.hwnd, self.painel.casa
                self.painel_sumiu()
                _u32.DestroyWindow(h)
                _u32.DestroyWindow(casa)   # a janela escondida onde o painel nasceu
            if c.get("estado"):
                self._avisar({"estado": self._estado()})
            if c.get("restaurar"):
                with self.trava:
                    self.pl.restaurar(base64.b64decode(c["restaurar"]))
            p = c.get("painel")
            if p:
                self._painel(p)

    def _painel(self, p):
        pai, r, vis = int(p.get("janela") or 0), p.get("r") or [0, 0, 10, 10], p.get("v", 1)
        if self.painel is None:
            if not vis or not pai or not self.pl.ctrl:
                return
            self.painel = _Painel(pai, r)
            self.painel.dono = self
            view = _chamar(self.pl.ctrl, 17, c_void_p, [c_char_p], b"editor")
            if not view or _chamar(view, 3, c_int32, [c_char_p], b"HWND") != K_OK:
                self._avisar({"erro": "o plugin não tem janela"})
                return
            self.view = view
            self.pl.janela = self.painel
            self.pl.moldura = _Moldura(self.pl)
            _chamar(view, 12, c_int32, [c_void_p], self.pl.moldura.ptr)
            _chamar(view, 4, c_int32, [c_void_p, c_char_p], self.painel.palco, b"HWND")
            self.painel.ligar(view)
            self.painel.levar()
            _u32.ShowWindow(self.painel.hwnd, 5)
            self._avisar({"painel": 1, "tam": [self.painel.vw, self.painel.vh]})
            return
        self.painel.fila.put({"r": r, "v": vis, **({"p": pai} if pai else {})})
        self.painel.comandos()

    def painel_sumiu(self):
        """A janela-mãe do painel fechou sem resgatar (ex.: o app fechando): solta a janela do plugin; o som continua."""
        if self.view:
            try:
                _chamar(self.view, 12, c_int32, [c_void_p], None)
                _chamar(self.view, 5, c_int32, [])
                _release(self.view)
            except Exception:
                pass
        self.view = self.painel = None
        self.pl.janela = None
        self._avisar({"painel": 0})

    def rodar(self):
        import json
        import sys
        self.servir_http()
        self._avisar({"ok": 1, "porta": self.porta, "token": self.token, "nome": self.pl.nome,
                      "atraso": int(_chamar(self.pl.proc, 6, c_uint32, [])), "janela": bool(self.pl.ctrl)})

        def ler():
            for linha in sys.stdin:
                try:
                    self.fila.put(json.loads(linha))
                    _u32.PostMessageW(self.hwnd, 0x8001, 0, 0)
                except Exception:
                    pass
            self.fila.put({"q": 1})
            _u32.PostMessageW(self.hwnd, 0x8001, 0, 0)
        threading.Thread(target=ler, daemon=True).start()
        msg = wintypes.MSG()
        while _u32.GetMessageW(byref(msg), None, 0, 0) > 0:
            _u32.TranslateMessage(byref(msg))
            _u32.DispatchMessageW(byref(msg))
        if self.view:
            _chamar(self.view, 12, c_int32, [c_void_p], None)
            _chamar(self.view, 5, c_int32, [])
            _release(self.view)
        with self.trava:
            self.pl.fechar()


def processar_arquivo(entrada, saida, cadeia):
    """Exportação (offline): WAV float estéreo 48 kHz → cadeia de plugins [{caminho, cid, estado}] → WAV. Atraso
    compensado em cada plugin; a cauda (reverb) entra até o fim do arquivo (a duração é a da timeline)."""
    import base64
    import wave  # noqa: F401  (o WAV é float: lido e gravado à mão)
    dados = _ler_wav_float(entrada)
    for e in cadeia:
        pl = Plugin(e["caminho"], e["cid"]).carregar(48000, modo=K_OFFLINE)
        if e.get("estado"):
            pl.restaurar(base64.b64decode(e["estado"]))
        dados = pl.processar(dados, compensar=True)
        pl.fechar()
    _gravar_wav_float(saida, dados)


def _ler_wav_float(arq):
    with open(arq, "rb") as f:
        b = f.read()
    i, fmt, dados = 12, None, None
    while i + 8 <= len(b):
        cid, tam = b[i:i + 4], struct.unpack("<I", b[i + 4:i + 8])[0]
        if cid == b"fmt ":
            fmt = struct.unpack("<HHIIHH", b[i + 8:i + 24])
        elif cid == b"data":
            dados = b[i + 8:i + 8 + tam]
        i += 8 + tam + (tam & 1)
    if not fmt or dados is None or fmt[0] not in (3, 0xFFFE) or fmt[5] != 32:
        raise RuntimeError("WAV precisa ser float 32 bits")
    ch = fmt[1]
    a = np.frombuffer(dados[:len(dados) // (4 * ch) * 4 * ch], np.float32).reshape(-1, ch).T
    return np.ascontiguousarray(a if ch == 2 else np.repeat(a[:1], 2, 0), np.float32)


def _gravar_wav_float(arq, a):
    a = np.ascontiguousarray(a.T, np.float32)
    corpo = a.tobytes()
    cab = b"RIFF" + struct.pack("<I", 36 + len(corpo)) + b"WAVE" + b"fmt " + struct.pack("<IHHIIHH", 16, 3, 2, 48000, 48000 * 8, 8, 32)
    with open(arq, "wb") as f:
        f.write(cab + b"data" + struct.pack("<I", len(corpo)) + corpo)


# ───────────────────────── processo à parte (o app chama assim: plugin que trava não derruba o KANIVETE) ─────────────
def main_cli(argv):
    """`<app> --vst3 varrer` → JSON da lista no stdout; `<app> --vst3 janela <caminho> <cid hex> [título]` → abre a
    janela do plugin e fica até ela fechar (tudo na mesma linha, como o VST3 pede)."""
    import json
    import sys
    if not argv:
        return 2
    if argv[0] == "varrer":
        out = varrer()
        sys.stdout.write(json.dumps(out, ensure_ascii=False))
        sys.stdout.flush()
        return 0
    if argv[0] == "servir" and len(argv) >= 3:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            pass
        estado = sys.stdin.readline().strip() if len(argv) > 3 and argv[3] == "-" else ""   # o ajuste vem pelo stdin
        _Servidor(argv[1], argv[2], estado).rodar()
        return 0
    if argv[0] == "processar" and len(argv) >= 4:
        processar_arquivo(argv[1], argv[2], json.load(open(argv[3], encoding="utf-8")))
        return 0
    if argv[0] == "encaixar" and len(argv) >= 8:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            pass
        encaixar(argv[1], argv[2], int(argv[3]), [int(float(v)) for v in argv[4:8]])
        return 0
    if argv[0] == "janela" and len(argv) >= 3:
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)   # janela nítida em tela com escala
        except Exception:
            pass
        pl = Plugin(argv[1], argv[2]).carregar(48000, modo=K_REALTIME)
        pl.abrir_janela(argv[3] if len(argv) > 3 else f"{pl.nome} — KANIVETE")
        pl.fechar()
        return 0
    return 2
