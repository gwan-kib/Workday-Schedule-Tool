const u={global:!0,local:{},log:{}},g=({global:e,local:n,log:o}={})=>{if(typeof e=="boolean"&&(u.global=e),n&&typeof n=="object")for(const[t,s]of Object.entries(n))typeof s=="boolean"&&(u.local[t]=s);if(o&&typeof o=="object")for(const[t,s]of Object.entries(o))typeof s=="boolean"&&(u.log[t]=s)},m=(e,n)=>!(!u.global||e&&u.local[e]===!1||n&&u.log[n]===!1),S=e=>{const n=e?`[UBC Workday - Schedule Tool (file: ${e})]
`:`[UBC Workday - Schedule Tool]
`;return{log:(r,...c)=>{let a=null,i=null;r&&typeof r=="object"&&!Array.isArray(r)?(a=r,i=c):(a=null,i=[r,...c]);const d=a?.id,h=a?.on===!0;a?.on!==!1&&(!h&&!m(e,d)||console.log(n,...i))},warn:(r,...c)=>{let a=null,i=null;r&&typeof r=="object"&&!Array.isArray(r)?(a=r,i=c):i=[r,...c];const d=a?.id,h=a?.on===!0;a?.on!==!1&&(!h&&!m(e,d)||console.log("⚠️",n,...i))},error:(r,...c)=>{let a=null,i=null;r&&typeof r=="object"&&!Array.isArray(r)?(a=r,i=c):i=[r,...c];const d=a?.id,h=a?.on===!0;a?.on!==!1&&(!h&&!m(e,d)||console.log("🚩",n,...i))},on:()=>g({local:{[e]:!0}}),off:()=>g({local:{[e]:!1}})}},_=S("rmpApi");g({local:{rmpApi:!1}});const T="https://www.ratemyprofessors.com",N="https://www.ratemyprofessors.com/graphql",b="dGVzdDp0ZXN0",w="FETCH_RMP_RATING",R="U2Nob29sLTE0MTM=",A="U2Nob29sLTU0MzY=",k=/^(dr|prof|professor|mr|mrs|ms)\.?\s+/i,I=/\s(?:and|&)\s|\/|;|\|/i,y=new Map;function p(e){return String(e||"").replace(/\s+/g," ").trim()}function U(e){return p(e).replace(/\([^)]*\)/g," ").replace(k,"").replace(/,$/,"").trim()}function P(e){const n=U(e);if(!n)return null;const o=n.toUpperCase();if(o==="N/A"||o==="TBA"||o==="STAFF"||I.test(n))return null;let t=n;if(n.includes(",")){const r=n.split(",").map(c=>p(c)).filter(Boolean);if(r.length!==2)return null;t=`${r[1]} ${r[0]}`}const s=t.split(" ").map(r=>r.trim()).filter(Boolean);if(s.length<2)return null;const f=s[0],l=s[s.length-1];return{fullName:s.join(" "),firstName:f,lastName:l}}function B(e){return String(e).toUpperCase()==="UBCO"?A:R}function L(e,n){return{query:`query TeacherSearchResultsPageQuery(
  $query: TeacherSearchQuery!
  $schoolID: ID
  $includeSchoolFilter: Boolean!
) {
  search: newSearch {
    ...TeacherSearchPagination_search_1ZLmLD
  }
  school: node(id: $schoolID) @include(if: $includeSchoolFilter) {
    __typename
    ... on School {
      name
    }
    id
  }
}

fragment TeacherSearchPagination_search_1ZLmLD on newSearch {
  teachers(query: $query, first: 8, after: "") {
    didFallback
    edges {
      cursor
      node {
        ...TeacherCard_teacher
        id
        __typename
      }
    }
    pageInfo {
      hasNextPage
      endCursor
    }
    resultCount
    filters {
      field
      options {
        value
        id
      }
    }
  }
}

fragment TeacherCard_teacher on Teacher {
  id
  legacyId
  avgRating
  numRatings
  ...CardFeedback_teacher
  ...CardSchool_teacher
  ...CardName_teacher
  ...TeacherBookmark_teacher
}

fragment CardFeedback_teacher on Teacher {
  wouldTakeAgainPercent
  avgDifficulty
}

fragment CardSchool_teacher on Teacher {
  department
  school {
    name
    id
  }
}

fragment CardName_teacher on Teacher {
  firstName
  lastName
}

fragment TeacherBookmark_teacher on Teacher {
  id
  isSaved
}
`,variables:{query:{text:e,schoolID:n,fallback:!1,departmentID:null},schoolID:n,includeSchoolFilter:!0}}}function $(e,n){const o=e?.data?.search?.teachers?.edges;if(!Array.isArray(o)||!o.length)return null;const t=String(n?.firstName||"").toLowerCase(),s=String(n?.lastName||"").toLowerCase();for(const f of o){const l=f?.node;if(!l||l.avgRating===0)continue;const r=p(l.firstName).toLowerCase(),c=p(l.lastName).toLowerCase();if(r.startsWith(t)&&c.endsWith(s))return{rating:l.avgRating,link:`${T}/professor/${l.legacyId}`}}return null}async function F({profName:e,campus:n}={}){const o=P(e);if(!o)return null;const t=String(n||"").toUpperCase()==="UBCO"?"UBCO":"UBCV",s=B(t),f=`${t}|${o.fullName.toUpperCase()}`;if(y.has(f))return y.get(f);_.log({id:"queryProfRating.request"},"Fetching professor rating",{profName:o.fullName,campus:t});const l=await fetch(N,{method:"POST",headers:{Authorization:`Basic ${b}`,"Content-Type":"application/json"},body:JSON.stringify(L(o.fullName,s))});if(!l.ok){const a=new Error(`RateMyProfessors request failed (${l.status})`);throw a.status=l.status,a}const r=await l.json(),c=$(r,o);return y.set(f,c),_.log({id:"queryProfRating.response"},"Resolved professor rating",{profName:o.fullName,campus:t,result:c}),c}const O=S("background");g({local:{background:!1}});chrome.runtime.onMessage.addListener((e,n,o)=>{if(e?.type===w)return(async()=>{try{const t=await F(e?.payload||{});o({ok:!0,data:t})}catch(t){O.error("Failed to fetch professor rating",{sender:n?.tab?.id||"unknown",error:String(t)}),o({ok:!1,error:t?.message||"Failed to fetch professor rating"})}})(),!0});
//# sourceMappingURL=background.js.map
