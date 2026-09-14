const METRICS = {
  dist: {label:'Distancia Total', unit:'m', dec:0, key:'dist'},
  hsr:  {label:'HSR', unit:'m', dec:0, key:'hsr'},
  vel:  {label:'Vel. Máxima', unit:'km/h', dec:1, key:'vel'},
  acc:  {label:'Acc', unit:'n°', dec:0, key:'acc'},
  desa: {label:'Desa', unit:'n°', dec:0, key:'desa'},
  pl:   {label:'Player Load', unit:'', dec:0, key:'pl'},
  sprint: {label:'Sprint Distancia', unit:'m', dec:0, key:'sprint'},
  sprint_count: {label:'Sprint Conteo', unit:'', dec:0, key:'sprint_count'},
  rhie: {label:'RHIE Bouts', unit:'', dec:0, key:'rhie'},
};
const METRIC_ORDER = ['dist','hsr','vel','acc','desa','pl','sprint','sprint_count','rhie'];
