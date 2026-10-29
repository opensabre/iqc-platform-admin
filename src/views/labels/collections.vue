<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { message, Modal } from "ant-design-vue";
import {
  createLabelCollection,
  reviseLabelCollection,
  disableLabelCollection,
  getLabelCollection,
  getLabelTree,
  listLabelCollections,
  publishLabelCollection,
  type LabelCollection,
  type LabelMember,
  type LabelTree,
} from "@/api/labels";
import { usePermission } from "@/composables/permission";
import LabelTreeSelector from "@/components/LabelTreeSelector.vue";

const { can } = usePermission();
const collections = ref<LabelCollection[]>([]),
  taxonomy = ref<LabelTree>({ categories: [], groups: [], labels: [] });
const loading = ref(false),
  open = ref(false),
  saving = ref(false);
const checkedKeys = ref<string[]>([]);
const editId = ref("");
const form = ref({ name: "", code: "", description: "" });
let disposed=false,listGeneration=0,editorGeneration=0,commandGeneration=0;
function clearEditor(){++editorGeneration;open.value=false;editId.value="";form.value={name:"",code:"",description:""};checkedKeys.value=[];}
async function refresh(){
  if(disposed)return;const generation=++listGeneration;loading.value=true;collections.value=[];taxonomy.value={categories:[],groups:[],labels:[]};
  try{const [rows,tree]=await Promise.all([can('iqc:label-collection:view')?listLabelCollections():Promise.resolve([]),can('iqc:label:view')?getLabelTree().catch(()=>undefined):Promise.resolve(undefined)]);
    if(disposed||generation!==listGeneration)return;collections.value=rows;if(tree)taxonomy.value=tree;
  }catch{if(!disposed&&generation===listGeneration)message.error("标签集合加载失败");}finally{if(!disposed&&generation===listGeneration)loading.value=false;}
}
function create(){
  if(disposed||saving.value||!can('iqc:label-collection:manage')||!can('iqc:label:view'))return;
  clearEditor();open.value=true;
}
async function edit(item:LabelCollection){
  if(disposed||saving.value||!can('iqc:label-collection:update')||!can('iqc:label-collection:detail:view'))return;
  clearEditor();const generation=editorGeneration;
  try{const detail=await getLabelCollection(item.id);if(disposed||generation!==editorGeneration||!can('iqc:label-collection:update')||!can('iqc:label-collection:detail:view'))return;
    editId.value=item.id;form.value={name:detail.collection.name,code:detail.collection.code,description:detail.collection.description||""};
    checkedKeys.value=detail.members.map(member=>`${member.memberType}:${member.memberId}`);open.value=true;
  }catch{if(!disposed&&generation===editorGeneration)message.error("集合详情加载失败");}
}
async function save(){
  const id=editId.value,permission=id?'iqc:label-collection:update':'iqc:label-collection:manage';
  if(disposed||saving.value||!open.value||!can(permission)||(!id&&!can('iqc:label:view')))return;
  if(!form.value.name||!form.value.code||!checkedKeys.value.length)return void message.warning("请填写名称、编码并选择成员");
  const generation=editorGeneration;
  const members:LabelMember[]=checkedKeys.value.map(key=>{const [memberType,memberId]=key.split(":");return {memberType:memberType as LabelMember['memberType'],memberId};});
  const request={...form.value,members};saving.value=true;
  try{if(id)await reviseLabelCollection(id,request);else await createLabelCollection(request);
    if(disposed||generation!==editorGeneration||!can(permission))return;
    message.success(id?"标签集合已修订为草稿":"标签集合已创建");clearEditor();await refresh();
  }catch{if(!disposed&&generation===editorGeneration)message.error("保存失败");}finally{saving.value=false;}
}
function disable(item:LabelCollection){
  if(disposed||saving.value||!can('iqc:label-collection:disable')||item.status==='DISABLED')return;
  const id=item.id,generation=commandGeneration;
  Modal.confirm({title:`确认停用“${item.name}”？`,async onOk(){
    if(disposed||saving.value||generation!==commandGeneration||!can('iqc:label-collection:disable'))return;saving.value=true;
    try{await disableLabelCollection(id);if(disposed||generation!==commandGeneration||!can('iqc:label-collection:disable'))return;message.success("集合已停用");await refresh();}
    catch{if(!disposed&&generation===commandGeneration)message.error("停用失败");}finally{saving.value=false;}
  }});
}
async function publish(id:string){
  if(disposed||saving.value||!can('iqc:label-collection:publish'))return;const generation=commandGeneration;saving.value=true;
  try{await publishLabelCollection(id);if(disposed||generation!==commandGeneration||!can('iqc:label-collection:publish'))return;message.success("标签集合已发布");await refresh();}
  catch{if(!disposed&&generation===commandGeneration)message.error("发布失败");}finally{saving.value=false;}
}
watch(()=>JSON.stringify([can('iqc:label-collection:view'),can('iqc:label-collection:detail:view'),can('iqc:label-collection:manage'),can('iqc:label-collection:update'),can('iqc:label-collection:publish'),can('iqc:label-collection:disable'),can('iqc:label:view')]),()=>{++listGeneration;++commandGeneration;clearEditor();loading.value=false;collections.value=[];taxonomy.value={categories:[],groups:[],labels:[]};void refresh();},{flush:'sync'});
watch(open,visible=>{if(!visible)clearEditor();});
onBeforeUnmount(()=>{disposed=true;++listGeneration;++commandGeneration;clearEditor();});
onMounted(refresh);
</script>
<template>
  <section class="page-intro">
    <div>
      <span class="section-kicker">LABEL COLLECTIONS</span>
      <h2>标签集合</h2>
      <p>集合只负责业务选择，任务创建时展开为固定标签与规则快照。</p>
    </div>
    <a-button
      v-if="can('iqc:label-collection:manage') && can('iqc:label:view')"
      :disabled="saving" type="primary"
      @click="create"
      >新建集合</a-button
    >
  </section>
  <a-card :bordered="false"
    ><a-table :loading="loading" :data-source="collections" row-key="id"
      ><a-table-column title="名称" data-index="name" /><a-table-column
        title="编码"
        data-index="code"
      /><a-table-column title="说明" data-index="description" /><a-table-column
        title="版本"
        :width="80"
        ><template #default="{ record }"
          >V{{ record.versionNo }}</template
        ></a-table-column
      ><a-table-column
        title="状态"
        data-index="status"
        :width="120"
      /><a-table-column title="操作" :width="220"
        ><template #default="{ record }"
          ><a-button
            v-if="
              record.status === 'DRAFT' && can('iqc:label-collection:publish')
            "
            type="link"
            @click="publish(record.id)"
            >发布</a-button
          ><a-button v-if="can('iqc:label-collection:update') && can('iqc:label-collection:detail:view')" :disabled="saving" type="link" @click="edit(record)">编辑</a-button
          ><a-button v-if="record.status !== 'DISABLED' && can('iqc:label-collection:disable')" type="link" danger @click="disable(record)">停用</a-button
          ></template
        ></a-table-column
      ></a-table
    ></a-card
  >
  <a-modal
    v-model:open="open"
    :title="editId ? '编辑标签集合' : '新建标签集合'"
    width="760"
    :confirm-loading="saving"
    @ok="save"
    ><a-form layout="vertical"
      ><a-row :gutter="16"
        ><a-col :span="12"
          ><a-form-item label="名称" required
            ><a-input v-model:value="form.name" /></a-form-item></a-col
        ><a-col :span="12"
          ><a-form-item label="稳定编码" required
            ><a-input v-model:value="form.code" :disabled="Boolean(editId)" /></a-form-item></a-col></a-row
      ><a-form-item label="说明"
        ><a-textarea v-model:value="form.description" /></a-form-item
      ><a-form-item label="集合成员" required
        ><LabelTreeSelector
          v-model="checkedKeys"
          :taxonomy="taxonomy" :disabled="saving || !can('iqc:label:view')" /></a-form-item></a-form
  ></a-modal>
</template>
