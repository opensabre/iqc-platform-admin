<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from "vue";
import { message } from "ant-design-vue";
import {
  approveLabelCandidate,
  getLabelTree,
  listLabelCandidates,
  listCandidateSimilarities,
  mergeLabelCandidate,
  rejectLabelCandidate,
  type LabelCandidate,
  type LabelTree,
  type LabelSimilarity,
} from "@/api/labels";
import { usePermission } from "@/composables/permission";

const { can } = usePermission();
const candidates = ref<LabelCandidate[]>([]);
const taxonomy = ref<LabelTree>({ categories: [], groups: [], labels: [] });
const loading = ref(false),
  reviewOpen = ref(false),
  mergeOpen = ref(false),
  saving = ref(false);
const selected = ref<LabelCandidate>();
const form = ref({ groupId: "", targetRole: "all", weight: 1, comment: "" });
const mergeTargetId = ref("");
const similarities = ref<LabelSimilarity[]>([]);

let disposed=false,listGeneration=0,editorGeneration=0;
function clearEditor(){++editorGeneration;reviewOpen.value=false;mergeOpen.value=false;selected.value=undefined;similarities.value=[];mergeTargetId.value="";form.value={groupId:"",targetRole:"all",weight:1,comment:""};}
function pending(item:LabelCandidate,permission:string){return !disposed&&!saving.value&&item.status==='PENDING'&&can(permission);}
async function refresh(){
  if(disposed)return;const generation=++listGeneration;loading.value=true;
  candidates.value=[];taxonomy.value={categories:[],groups:[],labels:[]};
  try{const [rows,tree]=await Promise.all([can('iqc:label-candidate:view')?listLabelCandidates():Promise.resolve([]),can('iqc:label:view')?getLabelTree().catch(()=>undefined):Promise.resolve(undefined)]);
    if(disposed||generation!==listGeneration)return;candidates.value=rows;
    if(tree)taxonomy.value=tree;
  }catch{if(!disposed&&generation===listGeneration)message.error("候选标签加载失败");}
  finally{if(!disposed&&generation===listGeneration)loading.value=false;}
}
function approve(item:LabelCandidate){
  if(!pending(item,'iqc:label-candidate:review')||!can('iqc:label:view'))return;
  clearEditor();selected.value=item;form.value={groupId:item.groupId||"",targetRole:"all",weight:1,comment:""};reviewOpen.value=true;
}
async function submit(){
  const item=selected.value;if(!item||!pending(item,'iqc:label-candidate:review')||!reviewOpen.value||!can('iqc:label:view'))return;
  if(!form.value.groupId)return void message.warning("请选择标签组");
  const generation=editorGeneration,request={...form.value};saving.value=true;
  try{await approveLabelCandidate(item.id,request);if(disposed||generation!==editorGeneration||!can('iqc:label-candidate:review'))return;
    message.success("候选已转为标签草稿，仍需绑定规则并发布");clearEditor();await refresh();
  }catch{if(!disposed&&generation===editorGeneration)message.error("批准失败");}finally{saving.value=false;}
}
async function reject(item:LabelCandidate){
  if(!pending(item,'iqc:label-candidate:reject'))return;const generation=listGeneration;saving.value=true;
  try{await rejectLabelCandidate(item.id,"人工审核拒绝");if(disposed||generation!==listGeneration||!can('iqc:label-candidate:reject'))return;message.success("候选已拒绝");await refresh();}
  catch{if(!disposed&&generation===listGeneration)message.error("拒绝失败");}finally{saving.value=false;}
}
async function openMerge(item:LabelCandidate){
  if(!pending(item,'iqc:label-candidate:merge')||!can('iqc:label:view'))return;
  clearEditor();selected.value=item;mergeOpen.value=true;const generation=editorGeneration;
  if(!can('iqc:label-candidate:similarities:view'))return;
  try{const rows=await listCandidateSimilarities(item.id);if(!disposed&&generation===editorGeneration&&mergeOpen.value&&can('iqc:label-candidate:similarities:view'))similarities.value=rows;}
  catch{if(!disposed&&generation===editorGeneration)message.warning("相似标签建议加载失败，可手动选择");}
}
async function merge(){
  const item=selected.value;if(!item||!pending(item,'iqc:label-candidate:merge')||!mergeOpen.value||!can('iqc:label:view'))return;
  if(!mergeTargetId.value)return void message.warning("请选择合并目标标签");
  const generation=editorGeneration,target=mergeTargetId.value;saving.value=true;
  try{await mergeLabelCandidate(item.id,target,"人工确认相似标签");if(disposed||generation!==editorGeneration||!can('iqc:label-candidate:merge'))return;message.success("候选已合并到现有标签");clearEditor();await refresh();}
  catch{if(!disposed&&generation===editorGeneration)message.error("合并失败");}finally{saving.value=false;}
}
watch(()=>[can('iqc:label-candidate:view'),can('iqc:label:view'),can('iqc:label-candidate:review'),can('iqc:label-candidate:reject'),can('iqc:label-candidate:merge'),can('iqc:label-candidate:similarities:view')],()=>{++listGeneration;clearEditor();loading.value=false;candidates.value=[];taxonomy.value={categories:[],groups:[],labels:[]};void refresh();},{flush:'sync'});
watch(()=>[reviewOpen.value,mergeOpen.value],()=>{if(!reviewOpen.value&&!mergeOpen.value)clearEditor();});
onBeforeUnmount(()=>{disposed=true;++listGeneration;clearEditor();});
onMounted(refresh);
</script>

<template>
  <section class="page-intro">
    <div>
      <span class="section-kicker">AI LABEL CANDIDATES</span>
      <h2>候选标签</h2>
      <p>
        AI 建议先进入隔离候选池；人工批准后只生成草稿，不能绕过规则绑定与发布。
      </p>
    </div>
  </section>
  <a-card :bordered="false"
    ><a-table :loading="loading" :data-source="candidates" row-key="id"
      ><a-table-column title="建议标签" :width="220"
        ><template #default="{ record }"
          ><strong>{{ record.suggestedName }}</strong
          ><br /><a-typography-text type="secondary">{{
            record.suggestedCode
          }}</a-typography-text></template
        ></a-table-column
      ><a-table-column title="任务/会话"
        ><template #default="{ record }"
          >{{ record.taskId }}<br />{{ record.conversationId }}</template
        ></a-table-column
      ><a-table-column
        title="置信度"
        data-index="confidence"
        :width="100"
      /><a-table-column
        title="状态"
        data-index="status"
        :width="110"
      /><a-table-column title="操作" :width="160"
        ><template #default="{ record }"
          ><template
            v-if="
              record.status === 'PENDING'
            "
            ><a-button v-if="can('iqc:label-candidate:review') && can('iqc:label:view')" :disabled="saving" type="link" @click="approve(record)">批准为草稿</a-button
            ><a-button v-if="can('iqc:label-candidate:merge') && can('iqc:label:view')" :disabled="saving" type="link" @click="openMerge(record)">合并</a-button
            ><a-button v-if="can('iqc:label-candidate:reject')" :disabled="saving" type="link" danger @click="reject(record)"
              >拒绝</a-button
            ></template
          ></template
        ></a-table-column
      ></a-table
    ></a-card
  >
  <a-modal
    v-model:open="reviewOpen"
    title="批准候选标签"
    :confirm-loading="saving"
    @ok="submit"
    ><a-alert
      type="warning"
      show-icon
      message="批准仅创建 DRAFT 标签；请随后配置标签值、绑定已发布规则并单独发布。"
      style="margin-bottom: 16px" /><a-form layout="vertical"
      ><a-form-item label="目标标签组" required
        ><a-select v-model:value="form.groupId"
          ><a-select-option
            v-for="item in taxonomy.groups"
            :key="item.id"
            :value="item.id"
            >{{ item.name }}</a-select-option
          ></a-select
        ></a-form-item
      ><a-row :gutter="12"
        ><a-col :span="12"
          ><a-form-item label="适用角色"
            ><a-select v-model:value="form.targetRole"
              ><a-select-option value="all">全部</a-select-option
              ><a-select-option value="agent">员工</a-select-option
              ><a-select-option value="user">客户</a-select-option
              ><a-select-option value="both">双方</a-select-option></a-select
            ></a-form-item
          ></a-col
        ><a-col :span="12"
          ><a-form-item label="权重"
            ><a-input-number
              v-model:value="form.weight"
              :min="0"
              style="width: 100%" /></a-form-item></a-col></a-row
      ><a-form-item label="审核说明"
        ><a-textarea v-model:value="form.comment" /></a-form-item></a-form
  ></a-modal>
  <a-modal v-model:open="mergeOpen" title="合并到现有标签" :confirm-loading="saving" @ok="merge"><a-form layout="vertical"><a-form-item v-if="similarities.length" label="相似标签建议"><a-space wrap><a-tag v-for="item in similarities" :key="item.labelId" color="blue" style="cursor:pointer" @click="mergeTargetId=item.labelId">{{item.name}} · {{(Number(item.score)*100).toFixed(0)}}%</a-tag></a-space></a-form-item><a-form-item label="目标标签" required><a-select v-model:value="mergeTargetId" show-search option-filter-prop="label"><a-select-option v-for="item in taxonomy.labels.filter(label=>label.status==='PUBLISHED')" :key="item.id" :value="item.id" :label="item.name">{{item.name}} · {{item.code}}</a-select-option></a-select></a-form-item></a-form></a-modal>
</template>
