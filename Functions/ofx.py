r"""Plugins de imagem OpenFX (OFX: o padrão do Resolve, Vegas, Nuke, Natron) — hospedeiro PRÓPRIO em ctypes, sem SDK.

Sempre num processo à parte (como o VST3: plugin que trava não derruba o app):
  <app> --ofx varrer                 → JSON com os efeitos instalados (cada .ofx descrito num processo dele)
  <app> --ofx descrever <x.ofx>      → JSON dos efeitos de um arquivo (usado pelo varrer)
  <app> --ofx render <x.ofx> <id> <entrada.png> <saida.png> [param=v,v ...]   (teste de um quadro)
O plugin vem num pacote <nome>.ofx.bundle/Contents/Win64/<nome>.ofx (DLL que exporta OfxGetNumberOfPlugins/OfxGetPlugin);
pastas: %COMMONPROGRAMFILES%\OFX\Plugins, OFX_PLUGIN_PATH (padrão OFX) e <raiz_dados>/Plugins OFX.
Suítes entregues: Property, ImageEffect, Parameter, Memory, MultiThread (uma linha), Message. Armadilhas medidas
(constantes com nome diferente, getDimension, "..." no Windows x64, linhas de baixo para cima): Instructions/agente/plugins.md.
"""
import ctypes as C
import json
import os
import sys
import time

import numpy as np

OK, FAILED, ERR_FATAL, ERR_UNKNOWN, ERR_MISSING, ERR_UNSUP, ERR_EXISTS, ERR_FORMAT, ERR_MEM, ERR_BADH, ERR_BADI, ERR_VAL = range(12)
REPLY_YES, REPLY_NO, REPLY_DEFAULT = 12, 13, 14
LOG = os.environ.get("OFX_LOG") == "1"
FALTOU = set()   # propriedades que o plugin pediu e o hospedeiro não tinha

vp, cp, i32, f64 = C.c_void_p, C.c_char_p, C.c_int, C.c_double
F = C.CFUNCTYPE


# ───────────── propriedades ─────────────
class Props:
    """Conjunto de propriedades: nome → [tipo, [valores]] (tipo: p/s/d/i)."""
    todos = {}
    _n = 0x1000

    def __init__(self, nome="", **kv):
        Props._n += 0x10
        self.h = Props._n
        self.nome = nome
        self.v = {}
        self.cbuf = {}
        Props.todos[self.h] = self
        for k, val in kv.items():
            self.set(k, val)

    def set(self, k, val, tipo=None):
        if not isinstance(val, (list, tuple)):
            val = [val]
        if tipo is None:
            a = val[0] if val else 0
            tipo = "s" if isinstance(a, (str, bytes)) else "d" if isinstance(a, float) else "p" if isinstance(a, Ptr) else "i"
        self.v[k] = [tipo, [x.v if isinstance(x, Ptr) else x for x in val]]

    def get(self, k, d=None):
        e = self.v.get(k)
        return d if e is None or not e[1] else e[1][0]

    def copia(self, nome=""):
        p = Props(nome or self.nome)
        p.v = {k: [t, list(v)] for k, (t, v) in self.v.items()}
        return p


class Ptr:
    def __init__(self, v):
        self.v = v


def _nome(n):
    return n.decode() if isinstance(n, bytes) else n


def _props(h):
    return Props.todos.get(h)


def p_set(tipo):
    def f(h, nome, idx, val):
        p = _props(h)
        if p is None:
            return ERR_BADH
        k = _nome(nome)
        e = p.v.setdefault(k, [tipo, []])
        e[0] = tipo
        if tipo == "s":
            val = (val or b"").decode("utf-8", "replace")
        elif tipo == "p":
            val = val or 0
        while len(e[1]) <= idx:
            e[1].append("" if tipo == "s" else 0)
        e[1][idx] = val
        if LOG:
            print("  set", p.nome, k, idx, val)
        return OK
    return f


def p_setN(tipo):
    def f(h, nome, n, arr):
        p = _props(h)
        if p is None:
            return ERR_BADH
        vals = [arr[i] for i in range(n)]
        if tipo == "s":
            vals = [(x or b"").decode("utf-8", "replace") for x in vals]
        elif tipo == "p":
            vals = [x or 0 for x in vals]
        p.v[_nome(nome)] = [tipo, vals]
        return OK
    return f


def _valor(p, k, idx, tipo):
    e = p.v.get(k)
    if e is None:
        FALTOU.add(f"{p.nome}:{k}")
        if LOG:
            print("  FALTA", p.nome, k)
        return None, ERR_UNKNOWN
    if idx >= len(e[1]) or idx < 0:
        return None, ERR_BADI
    v = e[1][idx]
    try:
        if tipo == "d":
            v = float(v)
        elif tipo == "i":
            v = int(v) if not isinstance(v, str) else int(v == "true")
    except Exception:
        return None, ERR_VAL
    return v, OK


def _cstr(p, k, i, s):
    b = p.cbuf.get((k, i, s))
    if b is None:
        b = p.cbuf[(k, i, s)] = C.create_string_buffer(s.encode("utf-8"))
    return C.cast(b, C.c_char_p)


def p_get(tipo):
    def f(h, nome, idx, out):
        p = _props(h)
        if p is None:
            return ERR_BADH
        k = _nome(nome)
        v, st = _valor(p, k, idx, tipo)
        if LOG == 2:
            print("  get", p.nome, k, idx, v, st)
        if st:
            return st
        if tipo == "s":
            C.cast(out, C.POINTER(C.c_char_p))[0] = _cstr(p, k, idx, str(v))
        elif tipo == "p":
            C.cast(out, C.POINTER(C.c_void_p))[0] = v or None
        elif tipo == "d":
            C.cast(out, C.POINTER(C.c_double))[0] = v
        else:
            C.cast(out, C.POINTER(C.c_int))[0] = v
        return OK
    return f


def p_getN(tipo):
    g = p_get(tipo)
    tam = {"s": 8, "p": 8, "d": 8, "i": 4}[tipo]

    def f(h, nome, n, out):
        for i in range(n):
            st = g(h, nome, i, (out or 0) + i * tam)
            if st:
                return st
        return OK
    return f


def p_reset(h, nome):
    return OK


def p_dim(h, nome, out):
    p = _props(h)
    if p is None:
        return ERR_BADH
    e = p.v.get(_nome(nome))
    if e is None:
        out[0] = 0   # o plugin pergunta o tamanho antes de acrescentar (addSupportedContext etc.)
        return OK
    out[0] = len(e[1])
    return OK


class PropSuite(C.Structure):
    _fields_ = [(n, t) for n, t in [
        ("setPointer", F(i32, vp, cp, i32, vp)), ("setString", F(i32, vp, cp, i32, cp)),
        ("setDouble", F(i32, vp, cp, i32, f64)), ("setInt", F(i32, vp, cp, i32, i32)),
        ("setPointerN", F(i32, vp, cp, i32, C.POINTER(vp))), ("setStringN", F(i32, vp, cp, i32, C.POINTER(cp))),
        ("setDoubleN", F(i32, vp, cp, i32, C.POINTER(f64))), ("setIntN", F(i32, vp, cp, i32, C.POINTER(i32))),
        ("getPointer", F(i32, vp, cp, i32, vp)), ("getString", F(i32, vp, cp, i32, vp)),
        ("getDouble", F(i32, vp, cp, i32, vp)), ("getInt", F(i32, vp, cp, i32, vp)),
        ("getPointerN", F(i32, vp, cp, i32, vp)), ("getStringN", F(i32, vp, cp, i32, vp)),
        ("getDoubleN", F(i32, vp, cp, i32, vp)), ("getIntN", F(i32, vp, cp, i32, vp)),
        ("reset", F(i32, vp, cp)), ("getDimension", F(i32, vp, cp, C.POINTER(i32)))]]


def _seguro(fn, nome):
    def g(*a):
        try:
            return fn(*a)
        except Exception as e:
            print(f"  ERRO em {nome}: {type(e).__name__}: {e}")
            return FAILED
    return g


_vivos = []


def _monta(tipo_struct, impl):
    s = tipo_struct()
    for nome, t in tipo_struct._fields_:
        cb = t(_seguro(impl[nome], nome))
        _vivos.append(cb)
        setattr(s, nome, cb)
    _vivos.append(s)
    return s


PROP = _monta(PropSuite, {
    "setPointer": p_set("p"), "setString": p_set("s"), "setDouble": p_set("d"), "setInt": p_set("i"),
    "setPointerN": p_setN("p"), "setStringN": p_setN("s"), "setDoubleN": p_setN("d"), "setIntN": p_setN("i"),
    "getPointer": p_get("p"), "getString": p_get("s"), "getDouble": p_get("d"), "getInt": p_get("i"),
    "getPointerN": p_getN("p"), "getStringN": p_getN("s"), "getDoubleN": p_getN("d"), "getIntN": p_getN("i"),
    "reset": p_reset, "getDimension": p_dim})


# ───────────── efeito, clipes, imagens, parâmetros ─────────────
class Efeito:
    todos = {}

    def __init__(self, props, nome):
        self.props = props
        self.params = Props(nome + ".params")   # o conjunto de parâmetros (handle próprio)
        self.lista = {}                          # nome → Param
        self.clipes = {}                         # nome → Props
        self.h = props.h + 1
        Efeito.todos[self.h] = self
        Efeito.todos[self.params.h] = self


class Param:
    todos = {}

    def __init__(self, tipo, nome, props):
        self.tipo, self.nome, self.props = tipo, nome, props
        self.h = props.h + 2
        self.valor = None
        Param.todos[self.h] = self


IMAGENS = {}   # handle do conjunto de propriedades da imagem → (Props, numpy)
FONTE = {}     # dados da entrada do render


def ef_getProps(eh, out):
    e = Efeito.todos.get(eh)
    if not e:
        return ERR_BADH
    out[0] = e.props.h
    return OK


def ef_getParamSet(eh, out):
    e = Efeito.todos.get(eh)
    if not e:
        return ERR_BADH
    out[0] = e.params.h
    return OK


def ef_clipDefine(eh, nome, out):
    e = Efeito.todos[eh]
    n = _nome(nome)
    p = Props(f"clip:{n}", OfxPropName=n, OfxImageClipPropOptional=0, OfxImageClipPropIsMask=0)
    e.clipes[n] = p
    out[0] = p.h
    return OK


def ef_clipGetHandle(eh, nome, out, outp):
    if LOG:
        print("  clipGetHandle", nome)
    e = Efeito.todos.get(eh)
    p = e and e.clipes.get(_nome(nome))
    if not p:
        return ERR_UNKNOWN
    out[0] = p.h
    if outp:
        outp[0] = p.h
    return OK


def ef_clipGetProps(ch, out):
    out[0] = ch
    return OK


def ef_clipGetImage(ch, t, regiao, out):
    if LOG:
        print("  clipGetImage", _props(ch).nome)
    p = _props(ch)
    n = p.get("OfxPropName")
    W, H = FONTE["W"], FONTE["H"]
    if n == "Output":
        arr = np.zeros((H, W, 4), np.float32)
    elif p.get("OfxImageClipPropConnected", 1):
        arr = FONTE["img"].copy()
    else:
        return FAILED
    img = Props(f"img:{n}")
    img.set("OfxImagePropData", Ptr(arr.ctypes.data))
    img.set("OfxImagePropBounds", [0, 0, W, H])
    img.set("OfxImagePropRegionOfDefinition", [0, 0, W, H])
    img.set("OfxImagePropRowBytes", W * 16)
    img.set("OfxImageEffectPropPixelDepth", "OfxBitDepthFloat")
    img.set("OfxImageEffectPropComponents", "OfxImageComponentRGBA")
    img.set("OfxImageEffectPropPreMultiplication", "OfxImageAlphaPremultiplied")
    img.set("OfxImageEffectPropRenderScale", [1.0, 1.0])
    img.set("OfxImagePropPixelAspectRatio", 1.0)
    img.set("OfxImagePropField", "OfxImageFieldNone")
    img.set("OfxImagePropUniqueIdentifier", f"{n}{t}")
    IMAGENS[img.h] = (img, arr, n)
    out[0] = img.h
    return OK


def ef_clipRelease(ih):
    return OK


class RectD(C.Structure):
    _fields_ = [("x1", f64), ("y1", f64), ("x2", f64), ("y2", f64)]


def ef_clipRoD(ch, t, out):
    out[0].x1, out[0].y1, out[0].x2, out[0].y2 = 0, 0, FONTE["W"], FONTE["H"]
    return OK


def ef_abort(eh):
    return 0


_mem = {}


def ef_memAlloc(eh, n, out):
    b = C.create_string_buffer(n)
    _mem[C.addressof(b)] = b
    out[0] = C.addressof(b)
    return OK


def ef_memFree(mh):
    _mem.pop(mh, None)
    return OK


def ef_memLock(mh, out):
    out[0] = mh
    return OK


def ef_memUnlock(mh):
    return OK


class EfSuite(C.Structure):
    _fields_ = [
        ("getPropertySet", F(i32, vp, C.POINTER(vp))), ("getParamSet", F(i32, vp, C.POINTER(vp))),
        ("clipDefine", F(i32, vp, cp, C.POINTER(vp))), ("clipGetHandle", F(i32, vp, cp, C.POINTER(vp), C.POINTER(vp))),
        ("clipGetPropertySet", F(i32, vp, C.POINTER(vp))), ("clipGetImage", F(i32, vp, f64, vp, C.POINTER(vp))),
        ("clipReleaseImage", F(i32, vp)), ("clipGetRegionOfDefinition", F(i32, vp, f64, C.POINTER(RectD))),
        ("abort", F(i32, vp)), ("imageMemoryAlloc", F(i32, vp, C.c_size_t, C.POINTER(vp))),
        ("imageMemoryFree", F(i32, vp)), ("imageMemoryLock", F(i32, vp, C.POINTER(vp))), ("imageMemoryUnlock", F(i32, vp))]


EFS = _monta(EfSuite, {
    "getPropertySet": ef_getProps, "getParamSet": ef_getParamSet, "clipDefine": ef_clipDefine,
    "clipGetHandle": ef_clipGetHandle, "clipGetPropertySet": ef_clipGetProps, "clipGetImage": ef_clipGetImage,
    "clipReleaseImage": ef_clipRelease, "clipGetRegionOfDefinition": ef_clipRoD, "abort": ef_abort,
    "imageMemoryAlloc": ef_memAlloc, "imageMemoryFree": ef_memFree, "imageMemoryLock": ef_memLock,
    "imageMemoryUnlock": ef_memUnlock})

# parâmetros: quantos valores e de que tipo cada tipo tem
DIM = {"OfxParamTypeDouble": (1, "d"), "OfxParamTypeInteger": (1, "i"), "OfxParamTypeBoolean": (1, "i"),
       "OfxParamTypeChoice": (1, "i"), "OfxParamTypeRGBA": (4, "d"), "OfxParamTypeRGB": (3, "d"),
       "OfxParamTypeDouble2D": (2, "d"), "OfxParamTypeInteger2D": (2, "i"), "OfxParamTypeDouble3D": (3, "d"),
       "OfxParamTypeInteger3D": (3, "i"), "OfxParamTypeString": (1, "s"), "OfxParamTypeCustom": (1, "s"),
       "OfxParamTypeStrChoice": (1, "s")}


def pa_define(sh, tipo, nome, out):
    e = Efeito.todos.get(sh)
    t, n = _nome(tipo), _nome(nome)
    p = Props(f"param:{n}", OfxPropName=n, OfxParamPropType=t, OfxPropLabel=n, OfxParamPropAnimates=1,
              OfxParamPropEnabled=1, OfxParamPropSecret=0, OfxParamPropCanUndo=1, OfxParamPropEvaluateOnChange=1)
    p.set("OfxParamPropHint", "")
    p.set("OfxParamPropScriptName", n)
    p.set("OfxParamPropParent", "")
    d = DIM.get(t)
    if d:
        p.set("OfxParamPropDefault", [0.0] * d[0] if d[1] == "d" else [""] if d[1] == "s" else [0] * d[0], d[1])
    e.lista[n] = Param(t, n, p)
    if out:
        out[0] = p.h
    return OK


def pa_getHandle(sh, nome, out, outp):
    e = Efeito.todos.get(sh)
    q = e and e.lista.get(_nome(nome))
    if not q:
        return ERR_UNKNOWN
    out[0] = q.h
    if outp:
        outp[0] = q.props.h
    return OK


def pa_setProps(sh, out):
    out[0] = sh
    return OK


def pa_props(ph, out):
    q = Param.todos.get(ph)
    if not q:
        return ERR_BADH
    out[0] = q.props.h
    return OK


def _valores(q):
    if q.valor is not None:
        return q.valor
    e = q.props.v.get("OfxParamPropDefault")
    return list(e[1]) if e else []


def _escreve(q, ptrs):
    d = DIM.get(q.tipo)
    if not d:
        return ERR_UNSUP
    n, t = d
    vals = _valores(q)
    for i in range(n):
        a = ptrs[i]
        if not a:
            continue
        v = vals[i] if i < len(vals) else 0
        if t == "d":
            C.cast(a, C.POINTER(C.c_double))[0] = float(v)
        elif t == "i":
            C.cast(a, C.POINTER(C.c_int))[0] = int(v)
        else:
            s = q.props.cbuf.setdefault(("valor", v), C.create_string_buffer(str(v).encode()))
            C.cast(a, C.POINTER(C.c_void_p))[0] = C.addressof(s)
    return OK


def pa_get(ph, a, b, c, d):
    q = Param.todos.get(ph)
    return _escreve(q, [a, b, c, d]) if q else ERR_BADH


def pa_getAt(ph, t, a, b, c, d):
    return pa_get(ph, a, b, c, d)


def _bits(q, regs):
    """valores passados por "..." (no Windows x64 cada um ocupa 8 bytes; double vem em bits)."""
    n, t = DIM.get(q.tipo, (1, "i"))
    out = []
    for r in regs[:n]:
        r = r or 0
        if t == "d":
            out.append(C.cast(C.pointer(C.c_uint64(r)), C.POINTER(C.c_double))[0])
        elif t == "i":
            out.append(C.c_int32(r & 0xFFFFFFFF).value)
        else:
            out.append(C.string_at(r).decode() if r else "")
    return out


def pa_set(ph, a, b, c, d):
    q = Param.todos.get(ph)
    if not q:
        return ERR_BADH
    q.valor = _bits(q, [a, b, c, d])
    return OK


def pa_setAt(ph, t, a, b, c, d):
    return pa_set(ph, a, b, c, d)


def pa_numKeys(ph, out):
    out[0] = 0
    return OK


def pa_nada(*a):
    return OK


def pa_fail(*a):
    return FAILED


u64 = C.c_uint64


class ParamSuite(C.Structure):
    _fields_ = [
        ("paramDefine", F(i32, vp, cp, cp, C.POINTER(vp))), ("paramGetHandle", F(i32, vp, cp, C.POINTER(vp), C.POINTER(vp))),
        ("paramSetGetPropertySet", F(i32, vp, C.POINTER(vp))), ("paramGetPropertySet", F(i32, vp, C.POINTER(vp))),
        ("paramGetValue", F(i32, vp, vp, vp, vp, vp)), ("paramGetValueAtTime", F(i32, vp, f64, vp, vp, vp, vp)),
        ("paramGetDerivative", F(i32, vp, f64, vp, vp, vp, vp)), ("paramGetIntegral", F(i32, vp, f64, f64, vp, vp, vp)),
        ("paramSetValue", F(i32, vp, u64, u64, u64, u64)), ("paramSetValueAtTime", F(i32, vp, f64, u64, u64, u64, u64)),
        ("paramGetNumKeys", F(i32, vp, C.POINTER(C.c_uint))), ("paramGetKeyTime", F(i32, vp, C.c_uint, vp)),
        ("paramGetKeyIndex", F(i32, vp, f64, i32, vp)), ("paramDeleteKey", F(i32, vp, f64)),
        ("paramDeleteAllKeys", F(i32, vp)), ("paramCopy", F(i32, vp, vp, f64, vp)),
        ("paramEditBegin", F(i32, vp, cp)), ("paramEditEnd", F(i32, vp))]


PARS = _monta(ParamSuite, {
    "paramDefine": pa_define, "paramGetHandle": pa_getHandle, "paramSetGetPropertySet": pa_setProps,
    "paramGetPropertySet": pa_props, "paramGetValue": pa_get, "paramGetValueAtTime": pa_getAt,
    "paramGetDerivative": pa_fail, "paramGetIntegral": pa_fail, "paramSetValue": pa_set,
    "paramSetValueAtTime": pa_setAt, "paramGetNumKeys": pa_numKeys, "paramGetKeyTime": pa_fail,
    "paramGetKeyIndex": pa_fail, "paramDeleteKey": pa_nada, "paramDeleteAllKeys": pa_nada, "paramCopy": pa_nada,
    "paramEditBegin": pa_nada, "paramEditEnd": pa_nada})


# memória, threads (uma só: o próprio OpenMP do plugin paraleliza), mensagens
def me_alloc(h, n, out):
    return ef_memAlloc(None, n, out)


class MemSuite(C.Structure):
    _fields_ = [("memoryAlloc", F(i32, vp, C.c_size_t, C.POINTER(vp))), ("memoryFree", F(i32, vp))]


MEMS = _monta(MemSuite, {"memoryAlloc": me_alloc, "memoryFree": ef_memFree})

THREAD_FN = F(None, C.c_uint, C.c_uint, vp)


def mt_run(fn, n, arg):
    THREAD_FN(fn)(0, 1, arg)
    return OK


def mt_cpus(out):
    out[0] = 1
    return OK


def mt_index(out):
    out[0] = 0
    return OK


class MtSuite(C.Structure):
    _fields_ = [("multiThread", F(i32, vp, C.c_uint, vp)), ("multiThreadNumCPUs", F(i32, C.POINTER(C.c_uint))),
                ("multiThreadIndex", F(i32, C.POINTER(C.c_uint))), ("multiThreadIsSpawnedThread", F(i32)),
                ("mutexCreate", F(i32, C.POINTER(vp), i32)), ("mutexDestroy", F(i32, vp)), ("mutexLock", F(i32, vp)),
                ("mutexUnLock", F(i32, vp)), ("mutexTryLock", F(i32, vp))]


def mx_create(out, n):
    out[0] = 0x77
    return OK


MTS = _monta(MtSuite, {"multiThread": mt_run, "multiThreadNumCPUs": mt_cpus, "multiThreadIndex": mt_index,
                       "multiThreadIsSpawnedThread": lambda: 0, "mutexCreate": mx_create, "mutexDestroy": pa_nada,
                       "mutexLock": pa_nada, "mutexUnLock": pa_nada, "mutexTryLock": pa_nada})


def ms_msg(h, tipo, mid, fmt, a, b, c, d):
    print("  MENSAGEM do plugin:", _nome(tipo), _nome(fmt or b""))
    return OK


class MsgSuite(C.Structure):
    _fields_ = [("message", F(i32, vp, cp, cp, cp, vp, vp, vp, vp)),
                ("setPersistentMessage", F(i32, vp, cp, cp, cp, vp, vp, vp, vp)), ("clearPersistentMessage", F(i32, vp))]


MSGS = _monta(MsgSuite, {"message": ms_msg, "setPersistentMessage": ms_msg, "clearPersistentMessage": pa_nada})

SUITES = {b"OfxPropertySuite": PROP, b"OfxImageEffectSuite": EFS, b"OfxParameterSuite": PARS,
          b"OfxMemorySuite": MEMS, b"OfxMultiThreadSuite": MTS, b"OfxMessageSuite": MSGS}
PEDIDAS = []


def fetch(host, nome, ver):
    PEDIDAS.append(f"{_nome(nome)} v{ver}")
    s = SUITES.get(nome)
    if s is None or (nome == b"OfxMessageSuite" and ver > 2):
        return None
    return C.addressof(s)


FETCH = F(vp, vp, cp, i32)(fetch)


class OfxHost(C.Structure):
    _fields_ = [("host", vp), ("fetchSuite", F(vp, vp, cp, i32))]


HOSTP = Props("host",
              OfxPropName="net.kanivete.KANIVETE", OfxPropLabel="KANIVETE",
              OfxPropVersionLabel="1.0", OfxImageEffectHostPropIsBackground=0,
              OfxImageEffectPropSupportsOverlays=0, OfxImageEffectPropSupportsMultiResolution=1,
              OfxImageEffectPropSupportsTiles=1, OfxImageEffectPropTemporalClipAccess=1,
              OfxImageEffectPropMultipleClipDepths=0, OfxImageEffectPropSupportsMultipleClipDepths=0, OfxImageEffectPropSupportsMultipleClipPARs=0,
              OfxImageEffectPropSetableFrameRate=0, OfxImageEffectPropSetableFielding=0,
              OfxParamHostPropSupportsCustomInteract=0, OfxParamHostPropSupportsStringAnimation=0,
              OfxParamHostPropSupportsChoiceAnimation=0, OfxParamHostPropSupportsBooleanAnimation=0,
              OfxParamHostPropSupportsCustomAnimation=0, OfxParamHostPropSupportsStrChoice=0,
              OfxParamHostPropSupportsStrChoiceAnimation=0, OfxParamHostPropSupportsParametricAnimation=0,
              OfxParamHostPropMaxParameters=-1, OfxParamHostPropMaxPages=0,
              OfxImageEffectPropOpenGLRenderSupported="false", OfxImageEffectPropCudaRenderSupported="false",
              OfxImageEffectPropOpenCLRenderSupported="false", OfxImageEffectPropMetalRenderSupported="false",
              OfxImageEffectPropRenderQualityDraft=0, OfxImageEffectHostPropNativeOrigin="kOfxHostNativeOriginBottomLeft",
              OfxImageEffectInstancePropSequentialRender=0)
HOSTP.set("OfxPropAPIVersion", [1, 4])
HOSTP.set("OfxPropVersion", [1, 0, 0])
HOSTP.set("OfxParamHostPropPageRowColumnCount", [0, 0])
HOSTP.set("OfxImageEffectPropSupportedComponents", ["OfxImageComponentRGBA", "OfxImageComponentAlpha"])
HOSTP.set("OfxImageEffectPropSupportedPixelDepths", ["OfxBitDepthFloat"])
HOSTP.set("OfxImageEffectPropSupportedContexts", ["OfxImageEffectContextFilter", "OfxImageEffectContextGeneral",
                                                  "OfxImageEffectContextGenerator", "OfxImageEffectContextTransition"])
HOST = OfxHost(HOSTP.h, FETCH)

MAIN = F(i32, cp, vp, vp, vp)


class OfxPlugin(C.Structure):
    _fields_ = [("pluginApi", cp), ("apiVersion", i32), ("pluginIdentifier", cp), ("vMajor", C.c_uint),
                ("vMinor", C.c_uint), ("setHost", F(None, C.POINTER(OfxHost))), ("mainEntry", MAIN)]


def carregar(caminho):
    pasta = os.path.dirname(caminho)
    os.add_dll_directory(pasta)
    for d in os.environ.get("OFX_DLLS", "").split(";"):
        if d:
            os.add_dll_directory(d)
    dll = C.CDLL(caminho)
    dll.OfxGetPlugin.restype = C.POINTER(OfxPlugin)
    n = dll.OfxGetNumberOfPlugins()
    return dll, [dll.OfxGetPlugin(i).contents for i in range(n)]


def act(pl, acao, h=None, ins=None, outs=None):
    t = time.perf_counter()
    r = pl.mainEntry(acao.encode(), h, ins.h if ins else None, outs.h if outs else None)
    if LOG or r not in (OK, REPLY_DEFAULT):
        print(f"  {acao} → {r} ({(time.perf_counter() - t) * 1000:.1f} ms)")
    return r


def descrever(pl, contexto="OfxImageEffectContextFilter"):
    pl.setHost(C.pointer(HOST))
    act(pl, "OfxActionLoad")
    d = Efeito(Props("efeito.desc"), "desc")
    if act(pl, "OfxActionDescribe", d.h) not in (OK, REPLY_DEFAULT):
        return None, None, None
    ctx = d.props.v.get("OfxImageEffectPropSupportedContexts", ["s", []])[1]
    if contexto not in ctx:
        contexto = ctx[0] if ctx else contexto
    dc = Efeito(d.props.copia("efeito.ctx"), "ctx")
    r = act(pl, "OfxImageEffectActionDescribeInContext", dc.h, Props("in", OfxImageEffectPropContext=contexto))
    return d, (dc if r in (OK, REPLY_DEFAULT) else None), contexto


def instancia(pl, dc, contexto, W, H):
    ip = dc.props.copia("efeito")
    ip.set("OfxImageEffectPropContext", contexto)
    ip.set("OfxPropIsInteractive", 0)
    ip.set("OfxImageEffectPropProjectSize", [float(W), float(H)])
    ip.set("OfxImageEffectPropProjectExtent", [float(W), float(H)])
    ip.set("OfxImageEffectPropProjectOffset", [0.0, 0.0])
    ip.set("OfxImageEffectPropProjectPixelAspectRatio", 1.0)
    ip.set("OfxImageEffectInstancePropEffectDuration", 100.0)
    ip.set("OfxImageEffectInstancePropSequentialRender", 0)
    ip.set("OfxImageEffectPropFrameRate", 30.0)
    ip.set("OfxImageEffectPropFrameRange", [0.0, 99.0])
    ip.set("OfxPropInstanceData", Ptr(0))
    ip.set("OfxImageEffectPropInAnalysis", 0)
    e = Efeito(ip, "inst")
    for n, cpd in dc.clipes.items():
        c = cpd.copia(f"clip:{n}")
        for k, v in {"OfxImageClipPropConnected": 1, "OfxImageEffectPropComponents": "OfxImageComponentRGBA",
                     "OfxImageEffectPropPixelDepth": "OfxBitDepthFloat",
                     "OfxImageClipPropUnmappedComponents": "OfxImageComponentRGBA",
                     "OfxImageClipPropUnmappedPixelDepth": "OfxBitDepthFloat",
                     "OfxImageEffectPropPreMultiplication": "OfxImageAlphaPremultiplied",
                     "OfxImagePropPixelAspectRatio": 1.0, "OfxImageEffectPropFrameRate": 30.0,
                     "OfxImageEffectPropUnmappedFrameRate": 30.0, "OfxImageClipPropFieldOrder": "OfxImageFieldNone",
                     "OfxImageClipPropContinuousSamples": 0}.items():
            c.set(k, v)
        c.set("OfxImageEffectPropFrameRange", [0.0, 99.0])
        c.set("OfxImageEffectPropUnmappedFrameRange", [0.0, 99.0])
        if n not in ("Source", "Output"):
            c.set("OfxImageClipPropConnected", 0)
        e.clipes[n] = c
    for n, q in dc.lista.items():
        e.lista[n] = Param(q.tipo, n, q.props.copia(f"param:{n}"))
    return e


def render(pl, e, t, W, H):
    ins = Props("render", OfxPropTime=float(t), OfxImageEffectPropFieldToRender="OfxImageFieldNone",
                OfxImageEffectPropSequentialRenderStatus=0, OfxImageEffectPropInteractiveRenderStatus=0,
                OfxImageEffectPropRenderQualityDraft=0)
    ins.set("OfxImageEffectPropRenderWindow", [0, 0, W, H])
    ins.set("OfxImageEffectPropRenderScale", [1.0, 1.0])
    ins.set("OfxImageEffectPropFrameRange", [float(t), float(t)])
    ins.set("OfxImageEffectPropFrameStep", 1.0)
    ins.set("OfxPropIsInteractive", 0)
    ins.set("OfxImageEffectPropOpenGLEnabled", 0)
    ins.set("OfxImageEffectPropRenderView", 0)
    ins.set("uk.co.thefoundry.OfxImageEffectPropView", 0)
    act(pl, "OfxImageEffectActionBeginSequenceRender", e.h, ins)
    IMAGENS.clear()
    global LOG
    if os.environ.get("OFX_LOG2"):
        LOG = 2
    r = act(pl, "OfxImageEffectActionRender", e.h, ins)
    act(pl, "OfxImageEffectActionEndSequenceRender", e.h, ins)
    saida = next((a for _, a, n in IMAGENS.values() if n == "Output"), None)
    return r, saida


def resumo_params(e):
    out = []
    for n, q in e.lista.items():
        if q.tipo in ("OfxParamTypeGroup", "OfxParamTypePage", "OfxParamTypePushButton"):
            continue
        d = q.props.v.get("OfxParamPropDefault", ["", []])[1]
        out.append(f"{n} ({q.tipo[12:]}) = {d}")
    return out


CONTEXTOS = {"OfxImageEffectContextFilter": "filtro", "OfxImageEffectContextGeneral": "geral",
             "OfxImageEffectContextTransition": "transicao", "OfxImageEffectContextGenerator": "gerador"}


def pastas():
    out = [os.path.join(os.environ.get("COMMONPROGRAMFILES", r"C:\Program Files\Common Files"), "OFX", "Plugins")]
    out += [x for x in os.environ.get("OFX_PLUGIN_PATH", "").split(";") if x]
    try:
        from Functions.midia import raiz_dados
        out.append(os.path.join(raiz_dados(), "Plugins OFX"))
    except Exception:
        pass
    return [x for x in dict.fromkeys(out) if os.path.isdir(x)]


def arquivos(raizes=None):
    """os .ofx dentro dos pacotes .ofx.bundle"""
    out = []
    for raiz in raizes or pastas():
        for base, dirs, arqs in os.walk(raiz):
            if os.path.basename(base).lower() == "win64":
                out += [os.path.join(base, a) for a in arqs if a.lower().endswith(".ofx")]
    return out


def descrever_arquivo(caminho):
    """efeitos de um .ofx: [{caminho, id, versao, nome, grupo, descricao, contextos, params}] (fica a versão maior de
    cada id). Erro → [{caminho, erro}]."""
    _, plugins = carregar(caminho)
    melhor = {}
    for pl in plugins:
        if (pl.pluginApi or b"").decode() != "OfxImageEffectPluginAPI":
            continue
        pid = pl.pluginIdentifier.decode()
        if pid in melhor and (melhor[pid][0].vMajor, melhor[pid][0].vMinor) >= (pl.vMajor, pl.vMinor):
            continue
        melhor[pid] = (pl, None)
    out = []
    for pid, (pl, _) in melhor.items():
        item = {"caminho": caminho, "id": pid, "versao": f"{pl.vMajor}.{pl.vMinor}"}
        try:
            d, dc, ctx = descrever(pl)
            if not d:
                item["erro"] = "o plugin recusou a descrição"
            else:
                ctxs = d.props.v.get("OfxImageEffectPropSupportedContexts", ["s", []])[1]
                item.update(nome=d.props.get("OfxPropLabel") or pid, grupo=d.props.get("OfxImageEffectPluginPropGrouping") or "",
                            descricao=(d.props.get("OfxPropPluginDescription") or "")[:400],
                            contextos=[CONTEXTOS[c] for c in ctxs if c in CONTEXTOS], contexto=CONTEXTOS.get(ctx, ""),
                            params=sum(1 for q in (dc.lista.values() if dc else []) if q.tipo in DIM))
        except Exception as e:
            item["erro"] = f"{type(e).__name__}: {e}"
        out.append(item)
    if not plugins:
        out.append({"caminho": caminho, "erro": "nenhum efeito: o plugin não aceita este programa (feito só para outro editor?)"})
    return out


def parametros(caminho, pid):
    """os ajustes de um efeito (para os Controles de efeito): {pid, nome, versao, contexto, clipes, params: [{n (nome
    OFX), tipo (sem o prefixo OfxParamType), rotulo, dica, def, min, max, dmin, dmax, opcoes, passo, casas, dtipo}]};
    ficam fora os secretos e os que não têm valor (grupo, página, botão)."""
    _, plugins = carregar(caminho)
    cands = [p for p in plugins if p.pluginIdentifier.decode() == pid]
    if not cands:
        raise RuntimeError("efeito não encontrado no arquivo")
    pl = max(cands, key=lambda p: (p.vMajor, p.vMinor))
    d, dc, ctx = descrever(pl)
    if not dc:
        raise RuntimeError("o plugin recusou a descrição")
    out = []
    for n, q in dc.lista.items():
        if q.tipo not in DIM or q.tipo in ("OfxParamTypeString", "OfxParamTypeCustom", "OfxParamTypeStrChoice"):
            continue
        g = q.props.v.get
        if (g("OfxParamPropSecret") or ["i", [0]])[1][:1] == [1]:
            continue
        val = lambda k: (g(k) or ["", []])[1]
        out.append({"n": n, "tipo": q.tipo[len("OfxParamType"):], "rotulo": q.props.get("OfxPropLabel") or n,
                    "dica": (q.props.get("OfxParamPropHint") or "")[:300], "def": val("OfxParamPropDefault"),
                    "min": val("OfxParamPropMin"), "max": val("OfxParamPropMax"), "dmin": val("OfxParamPropDisplayMin"),
                    "dmax": val("OfxParamPropDisplayMax"), "opcoes": val("OfxParamPropChoiceOption"),
                    "passo": q.props.get("OfxParamPropIncrement"), "casas": q.props.get("OfxParamPropDigits"),
                    "dtipo": q.props.get("OfxParamPropDoubleType") or ""})
    return {"pid": pid, "nome": d.props.get("OfxPropLabel") or pid, "versao": f"{pl.vMajor}.{pl.vMinor}",
            "contexto": CONTEXTOS.get(ctx, ""), "clipes": list(dc.clipes), "params": out}


def _cache_arq():
    try:
        from Functions.midia import pasta_cache
        return os.path.join(pasta_cache("ofx"), "lista.json")
    except Exception:
        return ""


def varrer(raizes=None, exe=None, atualizar=False):
    """todos os efeitos instalados; cada .ofx num processo dele (um que trave não leva a lista junto). Guarda o que
    achou por arquivo (caminho + data + tamanho): só descreve de novo o .ofx que mudou (o GMIC sozinho leva ~8 s)."""
    import subprocess
    exe = exe or ([sys.executable] if getattr(sys, "frozen", False) else
                  [sys.executable, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "main.py")])
    ca = _cache_arq()
    try:
        cache = {} if atualizar or not ca else json.load(open(ca, encoding="utf-8"))
    except Exception:
        cache = {}
    novo, out = {}, []
    for arq in arquivos(raizes):
        st = os.stat(arq)
        chave = f"{arq}|{int(st.st_mtime)}|{st.st_size}"
        if chave in cache:
            novo[chave] = cache[chave]
            out += cache[chave]
            continue
        antes = len(out)
        try:
            r = subprocess.run(exe + ["--ofx", "descrever", arq], capture_output=True, text=True, encoding="utf-8",
                               errors="replace", timeout=90, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            txt = r.stdout or ""
            k = txt.rfind("@@OFX ")
            out += json.loads(txt[k + 6:]) if k >= 0 else [{"caminho": arq, "erro": f"o plugin fechou (código {r.returncode})"}]
        except Exception as e:
            out.append({"caminho": arq, "erro": f"{type(e).__name__}: {e}"})
        if not any(x.get("erro") for x in out[antes:]):
            novo[chave] = out[antes:]
    if ca:
        try:
            json.dump(novo, open(ca, "w", encoding="utf-8"), ensure_ascii=False)
        except Exception:
            pass
    return out


def _render_teste(caminho, pid, ent, sai, ajustes):
    _, plugins = carregar(caminho)
    pl = next(p for p in plugins if p.pluginIdentifier.decode() == pid)
    from PIL import Image
    im = np.asarray(Image.open(ent).convert("RGBA"), np.float32) / 255.0
    im = np.ascontiguousarray(im[::-1])   # OFX: linha 0 = embaixo
    H, W = im.shape[:2]
    FONTE.update(img=im, W=W, H=H)
    d, dc, ctx = descrever(pl)
    if not dc:
        print("não descreveu")
        return 1
    e = instancia(pl, dc, ctx, W, H)
    act(pl, "OfxActionCreateInstance", e.h)
    for kv in ajustes:
        k, v = kv.split("=", 1)
        q = e.lista[k]
        q.valor = [float(x) if DIM[q.tipo][1] == "d" else int(x) for x in v.split(",")]
    t1 = time.perf_counter()
    r, out = render(pl, e, 0, W, H)
    print(f"render: {r} em {(time.perf_counter() - t1) * 1000:.0f} ms ({W}x{H})")
    if out is not None:
        Image.fromarray(np.clip(out[::-1] * 255 + 0.5, 0, 255).astype(np.uint8), "RGBA").save(sai)
    act(pl, "OfxActionDestroyInstance", e.h)
    return 0 if r == OK else 1


def main_cli(args):
    sys.stdout.reconfigure(encoding="utf-8")
    modo = args[0] if args else ""
    if modo == "varrer":
        atual = "--atualizar" in args
        print(json.dumps(varrer([a for a in args[1:] if a != "--atualizar"] or None, atualizar=atual), ensure_ascii=False))
        return 0
    if modo == "descrever":
        try:
            r = descrever_arquivo(args[1])
        except Exception as e:
            r = [{"caminho": args[1], "erro": f"{type(e).__name__}: {e}"}]
        print("\n@@OFX " + json.dumps(r, ensure_ascii=False), flush=True)
        os._exit(0)   # sem descarregar: alguns plugins travam no fim do processo
    if modo == "params":
        try:
            r = parametros(args[1], args[2])
        except Exception as e:
            r = {"erro": f"{type(e).__name__}: {e}"}
        print("\n@@OFX " + json.dumps(r, ensure_ascii=False), flush=True)
        os._exit(0)
    if modo == "render":
        return _render_teste(args[1], args[2], args[3], args[4], args[5:])
    print(__doc__)
    return 2
