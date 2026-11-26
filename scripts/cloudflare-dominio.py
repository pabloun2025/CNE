#!/usr/bin/env python3
"""Comprueba o crea el hostname de CNE en el túnel de Cloudflare que ya sirve ORIGEN, y su DNS.

Uso: cloudflare-dominio.py comprobar|crear HOST [ZONA] ORIGEN
El servicio de la regla nueva es siempre http://cne-app:38473 (no se copia el del origen: sería el de otra aplicación).
Nunca imprime el token.
"""
import json
import os
import sys
import urllib.error
import urllib.request

SERVICIO = "http://cne-app:38473"
API = "https://api.cloudflare.com/client/v4"


def api(token, metodo, ruta, cuerpo=None):
    req = urllib.request.Request(
        API + ruta,
        method=metodo,
        data=json.dumps(cuerpo).encode() if cuerpo is not None else None,
        headers={"authorization": "Bearer " + token, "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.loads(e.read() or b"{}") | {"http": e.code}


def zona_de(token, host, zona):
    """Devuelve la zona indicada o, si no, la más específica que contenga el host."""
    candidatas = [zona] if zona else [".".join(host.split(".")[i:]) for i in range(1, len(host.split(".")) - 0)]
    for nombre in candidatas:
        if nombre.count(".") < 1:
            continue
        zonas = api(token, "GET", f"/zones?name={nombre}").get("result") or []
        if zonas:
            return zonas[0]
    return None


def principal(argv, entorno):
    if len(argv) < 4:
        return "Uso: cloudflare-dominio.py comprobar|crear HOST ZONA ORIGEN"
    accion, host, zona, origen = argv[0], argv[1].strip().lower(), argv[2].strip().lower(), argv[3].strip().lower()
    if accion not in ("comprobar", "crear"):
        return "La acción debe ser comprobar o crear."
    token = entorno.get("CLOUDFLARE_API_TOKEN", "")
    if not token:
        return "AUSENTE: el secreto CLOUDFLARE_API_TOKEN no existe en GitHub (pabloun2025/CNE). Añádalo o cree el hostname a mano en Zero Trust > Tunnels (servicio http://cne-app:38473)."
    if not host:
        return "Falta el hostname: indíquelo en la entrada «host» o defina la variable HOST_MADRID."

    print("PRESENTE: el secreto existe.")
    v = api(token, "GET", "/user/tokens/verify")
    print("Token:", v.get("result", {}).get("status"), v.get("errors") or "")
    z = zona_de(token, host, zona)
    if not z:
        return f"El token no ve ninguna zona para {host}. Revise los recursos del token o indique la zona."
    cuenta, zona_id = z["account"]["id"], z["id"]
    print("Zona:", z["name"])
    dns = api(token, "GET", f"/zones/{zona_id}/dns_records?name={host}")
    print("DNS:", "ok" if dns.get("success") else dns.get("errors"))
    tuneles = api(token, "GET", f"/accounts/{cuenta}/cfd_tunnel?is_deleted=false")
    print("Túneles:", [(t["id"], t["name"], t["status"], t.get("config_src")) for t in tuneles.get("result") or []] if tuneles.get("success") else tuneles.get("errors"))
    if accion == "comprobar":
        return None
    if not dns.get("success"):
        return "No se pudo comprobar si el hostname ya está reservado."

    # Túnel existente: el que ya sirve ORIGEN; si no, el que tenga algún hostname de la misma zona.
    elegido = None
    for t in tuneles.get("result") or []:
        cfg = api(token, "GET", f"/accounts/{cuenta}/cfd_tunnel/{t['id']}/configurations")
        config_t = (cfg.get("result") or {}).get("config") or {}
        nombres = [r.get("hostname") or "" for r in config_t.get("ingress") or []]
        if origen in nombres:
            elegido = (t, config_t)
            break
        if host != "cne.consulado.app" and elegido is None and any(n.endswith("." + z["name"]) for n in nombres):
            elegido = (t, config_t)
    if not elegido:
        return f"Ningún túnel gestionado en Cloudflare sirve {origen} ni otro hostname de {z['name']}."
    t, config = elegido
    destino = f"{t['id']}.cfargotunnel.com"
    existente = [x for x in (dns.get("result") or []) if x["name"] == host]
    reglas = [r for r in config["ingress"] if r.get("hostname") == host]
    if any(x["type"] != "CNAME" or x["content"].rstrip(".") != destino for x in existente) or any(r.get("service") != SERVICIO for r in reglas):
        return "El hostname ya apunta a otro servicio. No se modificó."
    if reglas:
        print("Ingress: ya existía.")
    else:
        # La regla nueva va antes de la final «http_status:404» (la que no tiene hostname).
        con_host = [r for r in config["ingress"] if r.get("hostname")]
        sin_host = [r for r in config["ingress"] if not r.get("hostname")]
        config["ingress"] = con_host + [{"hostname": host, "service": SERVICIO}] + sin_host
        r = api(token, "PUT", f"/accounts/{cuenta}/cfd_tunnel/{t['id']}/configurations", {"config": config})
        print("Ingress:", "ok" if r.get("success") else r.get("errors"))
        if not r.get("success"):
            return "No se pudo guardar la configuración del túnel."
    registro = {"type": "CNAME", "name": host, "content": destino, "proxied": True}
    r = api(token, "PUT", f"/zones/{zona_id}/dns_records/{existente[0]['id']}", registro) if existente else api(token, "POST", f"/zones/{zona_id}/dns_records", registro)
    print("DNS CNAME:", "ok" if r.get("success") else r.get("errors"))
    if not r.get("success"):
        return "No se pudo crear el registro DNS."
    print(f"Listo: https://{host}")
    return None


if __name__ == "__main__":
    error = principal(sys.argv[1:], os.environ)
    if error:
        raise SystemExit(error)
