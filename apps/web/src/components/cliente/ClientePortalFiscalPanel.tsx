import { FiscalWorkspace } from '../../pages/portal/PortalFiscal'

export default function ClientePortalFiscalPanel({clienteId}:{clienteId:string}){
  return <FiscalWorkspace key={clienteId} clienteId={clienteId}/>
}
