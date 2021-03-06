const BaseRest = require('../rest.js');
module.exports = class extends BaseRest {
  async getAction() {
    const {page, pagesize, keyword} = this.get();

    let data;
    if (this.id) {
      const pk = await this.modelInstance.pk;
      data = await this.modelInstance.where({[pk]: this.id}).find();
      return this.success(data);
    } else if (keyword) {
      this.modelInstance = this.modelInstance.where({
        name: ['like', '%' + keyword + '%'],
        email: ['like', '%' + keyword + '%'],
        display_name: ['like', '%' + keyword + '%'],
        _logic: 'OR'
      });
    }
    data = await this.modelInstance.page([page, pagesize]).countSelect();
    return this.success(data);
  }

  async postAction() {
    const data = this.post();
    const insertId = await this.modelInstance.addUser(data, this.ctx.ip);

    if (insertId.type === 'exist') {
      return this.fail('USER_EXIST');
    }

    return this.success({id: insertId});
  }

  async putAction() {
    if (!this.id) {
      return this.fail('MISS USER ID');
    }

    let data = this.post();
    for (const i in data) {
      if (!data[i]) {
        delete data[i];
      }
    }

    data.id = this.id;
    data = await this.modelInstance.updateUser(data);
    return this.success(data);
  }
};
