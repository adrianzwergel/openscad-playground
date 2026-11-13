import base from './webpack.config.js';
import CopyPlugin from 'copy-webpack-plugin';
import webpack from 'webpack';
export default [
  {...base[0], entry:'./src/mechanics/studio.ts', output:{...base[0].output,filename:'studio.js'},plugins:[]},
  {...base[0], entry:'./src/shaft/page.ts', output:{...base[0].output,filename:'welle.js'},plugins:[]},
  {...base[0], entry:'./src/mechanics/app.tsx',
    devServer:{...base[0].devServer, hot:false, liveReload:false, client:false},
    output:{...base[0].output, filename:'mechanics.js'},
    plugins:[new CopyPlugin({patterns:[
      {from:'public', to:'.'},
      {from:'src/wasm/openscad.wasm', to:'openscad.wasm'},
      {from:'src/mechanics/prolog-worker.js', to:'prolog-worker.js'},
      {from:'src/mechanics/catalog.pl', to:'catalog.pl'},
    ]})]},
  {...base[1], entry:'./src/shaft/cad-worker.ts', resolve:{...base[1].resolve,fallback:{fs:false,path:false,crypto:false,module:false,url:false,worker_threads:false}},
    output:{...base[1].output, filename:'welle-cad-worker.js'},
    // OpenCascade's loader names node modules it only uses outside the browser.
    plugins:[...(base[1].plugins??[]),new webpack.NormalModuleReplacementPlugin(/^node:/,r=>{r.request=r.request.replace(/^node:/,'');})]},
  {...base[1], entry:'./src/mechanics/render-worker.ts',
    output:{...base[1].output, filename:'mechanics-render-worker.js'}},
  {...base[1], entry:'./src/mechanics/graph-search-worker.ts',
    output:{...base[1].output, filename:'mechanics-graph-search-worker.js'}},
  {...base[1], entry:'./src/mechanics/kinematics-worker.ts',
    output:{...base[1].output, filename:'mechanics-kinematics-worker.js'}},
  {...base[1], entry:'./src/mechanics/structure-worker.ts',
    output:{...base[1].output, filename:'mechanics-structure-worker.js'}},
  {...base[1], entry:'./src/mechanics/field-worker.ts',
    output:{...base[1].output, filename:'mechanics-field-worker.js'}},
  {...base[1], entry:'./src/mechanics/drive-worker.ts',
    output:{...base[1].output, filename:'mechanics-drive-worker.js'}},
  {...base[1], entry:'./src/mechanics/search-worker.ts',
    output:{...base[1].output, filename:'mechanics-search-worker.js'}}
];
